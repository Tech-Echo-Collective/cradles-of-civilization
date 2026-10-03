using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace CradlesOfCivilization.Native;

public partial class NativeMain
{
    private sealed record QuoteBlock(string Text, bool Quote, string? Source = null);
    private static readonly Regex QuoteDate = new(@"(?:公元前)?\d{1,4}年(?:\d{1,2}月(?:\d{1,2}日)?)?");
    private static readonly Regex QuoteNarrative = new(@"^(?:然后|但是|不过|于是|因为|因此|也就是|这时|那个|嗯|来吧|结果|换句话说|事实上|几乎|为了|以便|同时)");
    private static readonly Regex QuoteEffect = new(@"[ \t，；;]+(?=(?:SC\b|BE\b|LA\b|POP\b|ECO\b|EERF\b|人口|经济|科学|神学|秩序|稳定|兵力|本代文明|效果[：:]|影响[：:]))");

    // Keep the existing engine text intact, separating citation typography only.
    private static IEnumerable<QuoteBlock> ParseQuotedText(string value)
    {
        var text = value.Replace("\r\n", "\n").Replace('\r', '\n');
        var cursor = 0;
        foreach (Match match in Regex.Matches(text, "——"))
        {
            var dash = match.Index;
            if (dash < cursor) continue;
            var end = dash;
            while (end > cursor && char.IsWhiteSpace(text[end - 1])) end--;
            if (end == cursor) continue;
            var pairedStart = QuoteStart(text, end, cursor);
            var ownLine = text[end..dash].Contains('\n');
            var sourceEnd = QuoteSourceEnd(text, dash);
            var source = text[dash..sourceEnd].Trim();
            if (!QuoteLooksAttributed(source, pairedStart.HasValue, ownLine)) continue;
            var quoteStart = pairedStart;
            if (quoteStart == null)
            {
                if (ownLine)
                {
                    var paragraph = text[cursor..end];
                    var breaks = Regex.Matches(paragraph, @"\n[ \t]*\n");
                    var last = breaks.Count > 0 ? breaks[^1] : null;
                    quoteStart = last == null ? cursor : cursor + last.Index + last.Length;
                }
                else quoteStart = Math.Max(cursor, text.LastIndexOf('\n', Math.Max(0, end - 1)) + 1);
                var broadcast = Regex.Match(text[quoteStart.Value..end], @"^[ \t]*(?:趋势播报：)?(?:科学|神学)(?:升级至|降级至)[^：\n]{1,12}：");
                if (broadcast.Success) quoteStart += broadcast.Length;
            }
            var quote = text[quoteStart.Value..end].Trim();
            if (quote.Length == 0) continue;
            var prose = text[cursor..quoteStart.Value].Trim();
            if (prose.Length > 0) yield return new QuoteBlock(prose, false);
            yield return new QuoteBlock(quote, true, source);
            cursor = sourceEnd;
        }
        var remainder = text[cursor..].Trim();
        if (remainder.Length > 0) yield return new QuoteBlock(remainder, false);
    }

    private static int QuoteSourceEnd(string text, int dash)
    {
        var newline = text.IndexOf('\n', dash);
        var end = newline < 0 ? text.Length : newline;
        var line = text[(dash + 2)..end];
        var sentence = Regex.Match(line, "[。！？!?]");
        var length = sentence.Success ? sentence.Index + 1 : line.Length;
        var date = QuoteDate.Match(line);
        var scripture = Regex.Match(line, @"^[ \t]*《[^》\n]+》[ \t]*[，,]?[ \t]*\d+(?::\d+(?:[-–]\d+)?)?");
        var referenceEnd = date.Success ? date.Index + date.Length : scripture.Success ? scripture.Length : -1;
        if (referenceEnd >= 0)
        {
            var punctuation = Regex.IsMatch(line[referenceEnd..], "^[。.!！？?]") ? 1 : 0;
            length = Math.Min(length, referenceEnd + punctuation);
        }
        var effect = QuoteEffect.Match(line[..length]);
        if (effect.Success && effect.Index > 0) length = effect.Index;
        return dash + 2 + length;
    }

    private static int? QuoteStart(string text, int end, int lower)
    {
        if (end <= lower + 1) return null;
        var close = text[end - 1];
        var open = close switch { '”' => '“', '’' => '‘', '」' => '「', '』' => '『', '"' => '"', _ => '\0' };
        if (open == '\0') return null;
        if (open == close)
        {
            var index = text.LastIndexOf(open, end - 2);
            return index >= lower ? index : null;
        }
        var depth = 1;
        for (var index = end - 2; index >= lower; index--)
        {
            if (text[index] == close) depth++;
            else if (text[index] == open && --depth == 0) return index;
        }
        return null;
    }

    private static bool QuoteLooksAttributed(string source, bool quoted, bool ownLine)
    {
        var attribution = source[2..].Trim();
        if (attribution.Length == 0 || QuoteNarrative.IsMatch(attribution)) return false;
        if (Regex.IsMatch(attribution, @"^《[^》]+》(?=$|[\s，,\d。.!])")) return true;
        var date = QuoteDate.Match(attribution);
        if (date.Success && Regex.IsMatch(attribution[..date.Index], "[，,]")) return true;
        if (!quoted && !ownLine) return false;
        var name = Regex.Replace(attribution, "[。.!！?？]$", "").Trim();
        return Regex.IsMatch(name, @"^[\u3400-\u9fff·・、]{2,30}$") || Regex.IsMatch(name, @"^[A-Za-z][A-Za-z .’'\-]{1,70}$");
    }
}
