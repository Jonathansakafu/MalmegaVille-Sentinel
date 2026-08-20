import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authMiddleware.js';
import { dashboardLimiter } from '../middleware/rateLimiters.js';
import { nominatimUrl } from '../config.js';

const router = Router();

router.use(authenticate);
router.use(dashboardLimiter);

const reverseQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180)
});

router.get('/reverse', async (req, res) => {
  const parseResult = reverseQuerySchema.safeParse(req.query);
  if (!parseResult.success) {
    return res.status(400).json({ message: 'Valid lat and lon query parameters are required.' });
  }
  const { lat, lon } = parseResult.data;

  try {
    const url = `${nominatimUrl}?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`;
    const response = await fetch(url, {
      headers: {
        // Required by Nominatim's usage policy - identifies the app making the request.
        'User-Agent': 'MalmegaVille-Sentinel/1.0 (personal endpoint security dashboard)'
      }
    });

    if (!response.ok) {
      return res.status(502).json({ message: 'Reverse geocoding lookup failed.' });
    }

    const body: any = await response.json();
    const address = body.address ?? {};
    const street: string | undefined = address.road || address.pedestrian || address.footway;
    const area: string | undefined = address.suburb || address.neighbourhood || address.village;
    const city: string | undefined = address.city || address.town || address.county;

    const label = [street, area ?? city].filter(Boolean).join(', ') || body.display_name || 'Unknown location';

    res.json({
      label,
      displayName: body.display_name ?? null,
      street: street ?? null,
      city: city ?? null,
      country: address.country ?? null
    });
  } catch (error) {
    console.error('Reverse geocoding request failed', error);
    res.status(502).json({ message: 'Reverse geocoding lookup failed.' });
  }
});

export default router;
