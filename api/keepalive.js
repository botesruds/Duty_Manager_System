// Pinged daily by the Vercel cron in vercel.json. Supabase pauses free-tier
// projects after ~1 week without database activity (which took the site down
// on 2026-06-10); this query keeps the project active.
//
// The API key is the project's publishable key — the same one shipped to every
// browser that loads the app — so it is safe to commit.
export default async function handler(req, res) {
  const r = await fetch(
    'https://fmbnkmnwxajgyxjqlpzt.supabase.co/rest/v1/app_settings?select=id&limit=1',
    { headers: { apikey: 'sb_publishable_Kh7T86jcii_4PetYsXvk9A_Hj2suO3R' } },
  )
  res.status(r.ok ? 200 : 502).json({ supabase: r.status })
}
