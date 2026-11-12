using System;
using System.IO;
using System.Media;
using System.Text;
using System.Threading.Tasks;

namespace MalmegaVille.Sentinel.Desktop;

// Synthesised cues, the WPF counterpart of the web console's sound.ts and the
// Android SentinelSound. Nothing ships as an audio file: each cue is generated
// as a small PCM WAV in memory and played asynchronously, so rapid clicks can
// overlap without blocking the UI and audio failures never affect an action.
internal static class SentinelSound
{
    private const int SampleRate = 44100;
    private const double Amplitude = 0.3;

    private static readonly object ClickLock = new();
    private static DateTime _lastClickUtc = DateTime.MinValue;

    public static void Click() => Throttled(() => Play(t => Sin(1450, t) * Math.Exp(-t * 55), 0.055));

    public static void Key() => Play(t => Sin(2100, t) * Math.Exp(-t * 90) * 0.7, 0.035);

    public static void Nav() => Play(t =>
    {
        var freq = 540 + 360 * (t / 0.16);
        return Sin(freq, t) * Math.Exp(-t * 10);
    }, 0.16);

    public static void Grant() => PlayArpeggio(523.25, 659.25, 783.99, 1046.50);

    public static void Deny() => Play(t =>
    {
        var freq = 250 - 130 * (t / 0.46);
        var square = Sin(freq, t) >= 0 ? 1.0 : -1.0;
        return square * Math.Exp(-t * 2.6) * 0.62;
    }, 0.46);

    public static void Alert() => Play(t =>
    {
        var phase = t % 0.2;
        return phase < 0.13 ? Sin(660, t) * Math.Exp(-phase * 8) : 0.0;
    }, 0.4);

    // Movie-style boot swell: low saw drone under a rising sweep with a breath
    // of noise, faded at both edges so it never clicks.
    public static void Boot() => Play(t =>
    {
        var envelope = Math.Min(t / 0.18, 1.0) * Math.Min((1.3 - t) / 0.4, 1.0);
        var sweep = 68 + 230 * (t / 1.3);
        var saw = 2.0 * ((sweep * t) % 1.0) - 1.0;
        var noise = (Random.Shared.NextDouble() * 2 - 1) * 0.05;
        return (saw * 0.3 + Sin(sweep, t) * 0.42 + noise) * envelope;
    }, 1.3);

    private static double Sin(double frequency, double t) => Math.Sin(2 * Math.PI * frequency * t);

    private static void PlayArpeggio(params double[] frequencies)
    {
        const double note = 0.09;
        const double gap = 0.012;
        var step = note + gap;
        Play(t =>
        {
            var index = Math.Min((int)(t / step), frequencies.Length - 1);
            var local = t - index * step;
            return local > note ? 0.0 : Sin(frequencies[index], local) * Math.Exp(-local * 7.5);
        }, frequencies.Length * step);
    }

    private static void Throttled(Action action)
    {
        lock (ClickLock)
        {
            if (DateTime.UtcNow - _lastClickUtc < TimeSpan.FromMilliseconds(40))
            {
                return;
            }
            _lastClickUtc = DateTime.UtcNow;
        }
        action();
    }

    private static void Play(Func<double, double> generator, double seconds)
    {
        _ = Task.Run(() =>
        {
            try
            {
                using var stream = BuildWav(generator, seconds);
                using var player = new SoundPlayer(stream);
                player.PlaySync();
            }
            catch
            {
                // Audio is decorative - never let it interfere with a security action.
            }
        });
    }

    private static MemoryStream BuildWav(Func<double, double> generator, double seconds)
    {
        var count = (int)(seconds * SampleRate);
        var samples = new byte[count * 2];
        for (var i = 0; i < count; i++)
        {
            var value = Math.Clamp(generator(i / (double)SampleRate), -1.0, 1.0);
            var sample = (short)(value * short.MaxValue * Amplitude);
            samples[i * 2] = (byte)(sample & 0xFF);
            samples[i * 2 + 1] = (byte)((sample >> 8) & 0xFF);
        }

        var stream = new MemoryStream(44 + samples.Length);
        using (var writer = new BinaryWriter(stream, Encoding.ASCII, leaveOpen: true))
        {
            writer.Write(Encoding.ASCII.GetBytes("RIFF"));
            writer.Write(36 + samples.Length);
            writer.Write(Encoding.ASCII.GetBytes("WAVEfmt "));
            writer.Write(16);
            writer.Write((short)1);
            writer.Write((short)1);
            writer.Write(SampleRate);
            writer.Write(SampleRate * 2);
            writer.Write((short)2);
            writer.Write((short)16);
            writer.Write(Encoding.ASCII.GetBytes("data"));
            writer.Write(samples.Length);
            writer.Write(samples);
        }

        stream.Position = 0;
        return stream;
    }
}
