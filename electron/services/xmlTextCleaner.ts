/**
 * xmlTextCleaner.ts — 微信消息体 XML 包裹剥离（纯函数、零依赖，供词频分词前清洗）
 *
 * 背景（R3 修复）：微信 4.x 数据层返回的 message_content 是整段 XML 消息体，例如：
 *   <msg><fromusername>wxid_xxx</fromusername><scene>0</scene>
 *        <content><![CDATA[今天天气不错 &lt;3]]></content><msgsource>…</msgsource></msg>
 * 直接喂 jieba 分词会把 CDATA / gt / lt / msg / type / version 等标记词顶上词频榜首
 * （实测单会话 gt=30,751、CDATA=16,891；全量词云前 22 词条全是 XML 标记/实体）。
 *
 * 处理顺序（顺序有讲究，见 XML-STRIP.md 的样本对照）：
 *   1. 剥 CDATA：<![CDATA[…]]> → 内文（所有 CDATA 一遍剥完，含嵌套）。
 *   2. 解实体：&gt; &lt; &amp; &quot; &apos; 与 &#xXX; / &#NN;。
 *      必须整体先于元数据元素移除与标签剥离——微信存在「双层包裹」：
 *      外层 <content><![CDATA[ 里是一段整体转义的 &lt;msg&gt;…&lt;/msg&gt; ]]></content>，
 *      先解码才能让内层的元数据元素/标签被第 3、4 步清掉。
 *      命名实体同一遍从左到右解码（不重扫替换产物）、数字实体放最后，
 *      保证单遍解码语义：&amp;lt; → 字面 "&lt;"，不会被二次解码成 '<'。
 *   3. 元数据元素整体移除（标签 + 内文）：msgsource / fromusername / scene / type /
 *      version / id / appmsg / appinfo / refermsg / appattachs / tmp_node / node /
 *      lastG / MsgID。理由：这些元素的内文是机器元数据（wxid_xxx、v1_xxx 签名、
 *      被引消息的整段复制），不是聊天文本；只剥标签会留下值文本污染词云
 *      （实测 jieba 把 wxid_abc123 切成 wxid + abc123，后缀无法用停用词兜底）。
 *      refermsg 整体移除同时避免被引消息内容重复计数。
 *   4. 去标签：只匹配良构标签模式 /<\/?[a-zA-Z][^>]*>/g。content / title 的标签
 *      在这一步剥掉、内文保留（它们是真实文本）；<img …/> 自闭合标签整体消失。
 *      普通文本里的 <3、<=5、<10 元、a < b 不受影响（'<' 之后不是字母或 '/'）。
 *
 * 恒等性：对不含 '<' 与 '&' 的普通文本（纯中文即属此类）直接返回原字符串引用，
 * 清洗前后行为逐字节一致。
 *
 * 已知取舍（有意为之，见 XML-STRIP.md）：
 *   - 形如 "a<b c>d" 的普通文本会被误剥为 "ad"（任务指定只认良构标签模式）。
 *   - 用户文本里出现的 &lt;fromusername&gt;…&lt;/fromusername&gt; 等字面转义序列
 *     会被还原并当作元数据移除（概率极低，任务可接受）。
 *   - 同名元素嵌套（如 <appmsg> 内嵌 <appmsg>）时整体移除只到第一个同名闭标签。
 *   - 属性值里含 '>' 的标签（如 <img alt="a>b"/>）只剥到第一个 '>'。
 *   - 纯 JSON 外壳（{"MsgID":…}）不在 XML 剥离职责内，残留键词由 STOP_WORDS 兜底。
 *   - &nbsp; 等未列入需求的实体不解码，残留由 STOP_WORDS 兜底。
 */

const CDATA_RE = /<!\[CDATA\[([\s\S]*?)\]\]>/gi
// 元数据元素整体移除：<(名字)\b…>[\s\S]*?</\1>，成对剥离且含内文。
// 注意 tmp_node 必须排在 node 之前（JS 正则按书写顺序优先匹配）。
const METADATA_ELEMENT_RE =
  /<(msgsource|fromusername|scene|type|version|id|appmsg|appinfo|refermsg|appattachs|tmp_node|node|lastG|MsgID)\b[^>]*>[\s\S]*?<\/\1\s*>/gi
const NAMED_ENTITY_RE = /&(gt|lt|amp|quot|apos);/gi
const DEC_ENTITY_RE = /&#(\d{1,7});/g
const HEX_ENTITY_RE = /&#x([0-9a-f]{1,6});/gi
// XML 处理指令（R3b：<?xml version="1.0" encoding="utf-8"?> 声明，
// V1 实测残留成词 xml/1.0 各 3000+ 次）。普通文本中罕见，误伤可接受。
const XML_PI_RE = /<\?[^>]*\?>/g
const XML_TAG_RE = /<\/?[a-zA-Z][^>]*>/g

const NAMED_ENTITY_MAP: Record<string, string> = {
  gt: '>',
  lt: '<',
  amp: '&',
  quot: '"',
  apos: "'",
}

/** 把十进制/十六进制数字实体还原为字符；无效码点（越界/代理区）返回空串。 */
function decodeCodePoint(digits: string, radix: number): string {
  const code = parseInt(digits, radix)
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return ''
  if (code >= 0xd800 && code <= 0xdfff) return ''
  try {
    return String.fromCodePoint(code)
  } catch {
    return ''
  }
}

/**
 * 剥离微信消息文本里的 XML 包裹：CDATA → 内文、实体 → 字符、
 * 元数据元素 → 整体移除、其余良构标签 → 空。
 * 对纯中文/无尖括号与 & 的文本是恒等变换。
 */
export function stripXmlText(text: string): string {
  if (!text) return text
  if (!text.includes('<') && !text.includes('&')) return text

  let s = text.replace(CDATA_RE, '$1')

  s = s.replace(NAMED_ENTITY_RE, (_match, name: string) => NAMED_ENTITY_MAP[name.toLowerCase()])
  s = s.replace(DEC_ENTITY_RE, (_match, digits: string) => decodeCodePoint(digits, 10))
  s = s.replace(HEX_ENTITY_RE, (_match, digits: string) => decodeCodePoint(digits, 16))

  s = s.replace(METADATA_ELEMENT_RE, '')
  s = s.replace(XML_PI_RE, '')
  s = s.replace(XML_TAG_RE, '')
  return s
}
