package com.malmegaville.sentinel

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import kotlin.math.PI
import kotlin.math.exp
import kotlin.math.sin
import kotlin.random.Random

// Synthesised cue set, the Android counterpart of frontend/src/lib/sound.ts.
// No audio assets ship with the app: every cue is generated as PCM on demand
// and played on the sonification stream, so it follows the phone's media
// volume and never blocks a security action if audio is unavailable.
object SentinelSound {
    private const val RATE = 44100
    private const val AMPLITUDE = 0.32

    @Volatile
    var enabled: Boolean = true

    fun click(context: Context) = play { pcm(0.055) { t -> sin(2 * PI * 1450 * t) * exp(-t * 55) } }

    fun key(context: Context) = play { pcm(0.035) { t -> sin(2 * PI * 2100 * t) * exp(-t * 90) * 0.7 } }

    fun nav(context: Context) = play {
        pcm(0.16) { t ->
            val freq = 540.0 + 360.0 * (t / 0.16)
            sin(2 * PI * freq * t) * exp(-t * 10)
        }
    }

    fun grant(context: Context) = play { arpeggio(523.25, 659.25, 783.99, 1046.50) }

    fun deny(context: Context) = play {
        pcm(0.46) { t ->
            val freq = 250.0 - 130.0 * (t / 0.46)
            val square = if (sin(2 * PI * freq * t) >= 0.0) 1.0 else -1.0
            square * exp(-t * 2.6) * 0.62
        }
    }

    fun alert(context: Context) = play {
        pcm(0.4) { t ->
            val phase = t % 0.2
            if (phase < 0.13) sin(2 * PI * 660 * t) * exp(-phase * 8) else 0.0
        }
    }

    // Movie-style boot swell: low saw drone under a rising sweep with a breath
    // of noise, fading in and out so it never clicks at the edges.
    fun boot(context: Context) = play {
        pcm(1.3) { t ->
            val envelope = minOf(t / 0.18, 1.0) * minOf((1.3 - t) / 0.4, 1.0)
            val sweep = 68.0 + 230.0 * (t / 1.3)
            val saw = 2.0 * ((sweep * t) % 1.0) - 1.0
            val hum = sin(2 * PI * sweep * t)
            (saw * 0.3 + hum * 0.42 + Random.nextDouble(-1.0, 1.0) * 0.05) * envelope
        }
    }

    private fun arpeggio(vararg freqs: Double): ShortArray {
        val note = 0.09
        val gap = 0.012
        val step = note + gap
        return pcm(freqs.size * step) { t ->
            val index = (t / step).toInt().coerceAtMost(freqs.size - 1)
            val local = t - index * step
            if (local > note) 0.0 else sin(2 * PI * freqs[index] * local) * exp(-local * 7.5)
        }
    }

    private fun pcm(seconds: Double, generator: (t: Double) -> Double): ShortArray {
        val count = (seconds * RATE).toInt()
        val out = ShortArray(count)
        for (i in 0 until count) {
            val value = generator(i.toDouble() / RATE).coerceIn(-1.0, 1.0)
            out[i] = (value * Short.MAX_VALUE * AMPLITUDE).toInt().toShort()
        }
        return out
    }

    private fun play(generator: () -> ShortArray) {
        if (!enabled) return
        Thread {
            var track: AudioTrack? = null
            try {
                val samples = generator()
                val audio = AudioTrack.Builder()
                    .setAudioAttributes(
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build()
                    )
                    .setAudioFormat(
                        AudioFormat.Builder()
                            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                            .setSampleRate(RATE)
                            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                            .build()
                    )
                    .setTransferMode(AudioTrack.MODE_STATIC)
                    .setBufferSizeInBytes(samples.size * 2)
                    .build()
                track = audio
                audio.write(samples, 0, samples.size)
                audio.play()
                Thread.sleep(samples.size * 1000L / RATE + 60L)
                audio.stop()
            } catch (_: Exception) {
                // Audio is decorative - never let it interfere with the action.
            } finally {
                try {
                    track?.release()
                } catch (_: Exception) {
                }
            }
        }.apply { isDaemon = true }.start()
    }
}
