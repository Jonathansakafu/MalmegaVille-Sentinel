using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;

namespace MalmegaVille.Sentinel.Desktop.Controls;

/// <summary>
/// The WPF twin of the web console's .holo-panel: a sharp panel with one
/// clipped corner, a thin neon edge and the two HUD corner brackets. Content
/// is clipped to the same outline so nothing spills past the cut corner.
/// </summary>
public class HoloPanel : ContentControl
{
    private static readonly Brush DefaultAccentBrush = Freeze(new SolidColorBrush(Color.FromRgb(0x00, 0xFF, 0x88)));
    private static readonly Brush DefaultFillBrush = Freeze(new SolidColorBrush(Color.FromArgb(0xEE, 0x07, 0x10, 0x09)));

    public static readonly DependencyProperty AccentProperty = DependencyProperty.Register(
        nameof(Accent),
        typeof(Brush),
        typeof(HoloPanel),
        new FrameworkPropertyMetadata(DefaultAccentBrush, FrameworkPropertyMetadataOptions.AffectsRender));

    public Brush Accent
    {
        get => (Brush)GetValue(AccentProperty);
        set => SetValue(AccentProperty, value);
    }

    public HoloPanel()
    {
        SnapsToDevicePixels = true;
        UseLayoutRounding = true;
    }

    protected override void OnRenderSizeChanged(SizeChangedInfo sizeInfo)
    {
        base.OnRenderSizeChanged(sizeInfo);
        Clip = BuildOutline(ActualWidth, ActualHeight, 0.5);
    }

    protected override void OnRender(DrawingContext dc)
    {
        base.OnRender(dc);

        var width = ActualWidth;
        var height = ActualHeight;
        if (width <= 0 || height <= 0)
        {
            return;
        }

        var fill = Background ?? DefaultFillBrush;
        var accentColor = (Accent as SolidColorBrush)?.Color ?? Color.FromRgb(0x00, 0xFF, 0x88);
        var strokeBrush = BorderBrush ?? Freeze(new SolidColorBrush(Color.FromArgb(0x2A, accentColor.R, accentColor.G, accentColor.B)));
        var stroke = new Pen(strokeBrush, 1);
        stroke.Freeze();

        dc.DrawGeometry(fill, stroke, BuildOutline(width, height, 0.5));

        var bracketPen = new Pen(Freeze(new SolidColorBrush(Color.FromArgb(0xA6, accentColor.R, accentColor.G, accentColor.B))), 1);
        bracketPen.Freeze();
        dc.DrawGeometry(null, bracketPen, BuildBrackets(width, height));
    }

    private static Geometry BuildOutline(double width, double height, double inset)
    {
        var cut = Math.Min(14, Math.Min(width, height) / 3);
        var geometry = new StreamGeometry();
        using (var context = geometry.Open())
        {
            context.BeginFigure(new Point(cut, inset), true, true);
            context.LineTo(new Point(width - inset, inset), true, false);
            context.LineTo(new Point(width - inset, height - cut), true, false);
            context.LineTo(new Point(width - cut, height - inset), true, false);
            context.LineTo(new Point(inset, height - inset), true, false);
            context.LineTo(new Point(inset, cut), true, false);
        }

        geometry.Freeze();
        return geometry;
    }

    private static Geometry BuildBrackets(double width, double height)
    {
        const double size = 10;
        const double offset = 6;

        var geometry = new StreamGeometry();
        using (var context = geometry.Open())
        {
            context.BeginFigure(new Point(width - offset - size, offset), false, false);
            context.LineTo(new Point(width - offset, offset), true, false);
            context.LineTo(new Point(width - offset, offset + size), true, false);

            context.BeginFigure(new Point(offset, height - offset - size), false, false);
            context.LineTo(new Point(offset, height - offset), true, false);
            context.LineTo(new Point(offset + size, height - offset), true, false);
        }

        geometry.Freeze();
        return geometry;
    }

    private static Brush Freeze(Brush brush)
    {
        brush.Freeze();
        return brush;
    }
}
