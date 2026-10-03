using Godot;

namespace CradlesOfCivilization.Native;

public static class NativeTheme
{
    public static readonly Color Background = new("#111715");
    public static readonly Color Panel = new("#1c2420");
    public static readonly Color PanelSoft = new("#26302a");
    public static readonly Color Ink = new("#eadfc0");
    public static readonly Color Muted = new("#a39d87");
    public static readonly Color Gold = new("#b9a06a");
    public static readonly Color Line = new("#4b4b37");
    public static readonly Color Danger = new("#d39a7f");
    public static readonly Color Science = new("#a2b99e");

    public static StyleBoxFlat Box(Color background, Color? border = null, int padding = 12)
    {
        var box = new StyleBoxFlat
        {
            BgColor = background, BorderColor = border ?? Line,
            BorderWidthLeft = 1, BorderWidthRight = 1, BorderWidthTop = 1, BorderWidthBottom = 1,
            ContentMarginLeft = padding, ContentMarginRight = padding,
            ContentMarginTop = padding, ContentMarginBottom = padding,
            CornerRadiusBottomLeft = 2, CornerRadiusBottomRight = 2,
            CornerRadiusTopLeft = 2, CornerRadiusTopRight = 2,
        };
        return box;
    }

    public static Theme Create()
    {
        var theme = new Theme
        {
            DefaultFont = new SystemFont
            {
                FontNames = new[] { "Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei", "WenQuanYi Zen Hei", "Arial" },
                AllowSystemFallback = true,
            },
            DefaultFontSize = 14,
        };
        foreach (var type in new[] { "Label", "Button", "CheckBox", "LineEdit", "OptionButton", "TextEdit", "PopupMenu" })
        {
            theme.SetColor("font_color", type, Ink);
            theme.SetColor("font_hover_color", type, Ink);
            theme.SetColor("font_pressed_color", type, Ink);
            theme.SetColor("font_disabled_color", type, Muted.Darkened(.25f));
        }
        theme.SetStylebox("panel", "PanelContainer", Box(Panel));
        theme.SetStylebox("panel", "PopupMenu", Box(Panel));
        foreach (var type in new[] { "Button", "OptionButton" })
        {
            theme.SetStylebox("normal", type, Box(PanelSoft, Line, 8));
            theme.SetStylebox("hover", type, Box(PanelSoft.Lightened(.1f), Gold, 8));
            theme.SetStylebox("pressed", type, Box(new Color("#514731"), Gold, 8));
            theme.SetStylebox("disabled", type, Box(Background, Line.Darkened(.2f), 8));
            theme.SetStylebox("focus", type, Box(Colors.Transparent, Gold, 0));
        }
        foreach (var type in new[] { "LineEdit", "TextEdit" })
        {
            theme.SetStylebox("normal", type, Box(Background, Line, 8));
            theme.SetStylebox("focus", type, Box(Background, Gold, 8));
            theme.SetColor("caret_color", type, Gold);
            theme.SetColor("font_placeholder_color", type, Muted);
        }
        theme.SetStylebox("background", "ProgressBar", Box(Background, Line, 0));
        theme.SetStylebox("fill", "ProgressBar", Box(Gold.Darkened(.2f), Gold, 0));
        theme.SetColor("font_color", "RichTextLabel", Ink);
        theme.SetConstant("separation", "VBoxContainer", 8);
        theme.SetConstant("separation", "HBoxContainer", 8);
        theme.SetConstant("separation", "HSeparator", 10);
        return theme;
    }
}
