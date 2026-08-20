using System.Threading;
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

            // Auto-exposure/auto-white-balance convergence takes real time, not just a
            // handful of frames - 3 discarded frames (the previous approach) often still
            // produced solid-black or near-black stills, especially indoors/low light.
            // Give the sensor up to ~1.5s to settle, checking frame brightness so a
            // camera that's already warmed up doesn't wait needlessly.
            using var frame = new Mat();
            const int maxWarmupFrames = 30;
            for (var i = 0; i < maxWarmupFrames; i++)
            {
                if (!capture.Read(frame) || frame.Empty())
                {
                    continue;
                }

                if (Cv2.Mean(frame).Val0 > 15)
                {
                    break;
                }

                Thread.Sleep(50);
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
