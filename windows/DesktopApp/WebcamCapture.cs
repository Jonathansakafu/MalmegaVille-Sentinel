using OpenCvSharp;

namespace MalmegaVille.Sentinel.Desktop;

// Grabs a single still frame from the default webcam with no visible preview
// window. Note: the physical camera activity LED on most laptops is wired
// directly to the sensor hardware and cannot be suppressed by software - that
// is a hardware constraint of any webcam capture approach, not specific to
// this implementation.
public static class WebcamCapture
{
    public static byte[]? CaptureSingleFrameJpeg()
    {
        try
        {
            using var capture = new VideoCapture(0);
            if (!capture.IsOpened())
            {
                return null;
            }

            using var frame = new Mat();
            // Discard the first few frames - many webcams return a black or
            // garbage frame immediately after opening while auto-exposure settles.
            for (var i = 0; i < 3; i++)
            {
                capture.Read(frame);
            }

            if (frame.Empty())
            {
                return null;
            }

            return frame.ImEncode(".jpg");
        }
        catch
        {
            // Camera busy, absent, or access denied - fail silently, never surface
            // an error anywhere in the UI.
            return null;
        }
    }
}
