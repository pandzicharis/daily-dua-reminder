/* ==========================================================================
   GET /api/config -> { vapidPublicKey }

   Javni VAPID ključ smije u browser — bez njega se ne može napraviti push
   pretplata. PRIVATNI ključ ne izlazi odavde nikad; koristi ga samo
   api/cron.js na serveru.

   Ključ se servira odavde umjesto da stoji upisan u JS fajlu, da postoji
   samo na jednom mjestu (env varijabla) i da se ne razidu.
   ========================================================================== */

module.exports = function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "metoda nije dozvoljena" });
  }

  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) {
    return res.status(500).json({ error: "VAPID_PUBLIC_KEY nije postavljen" });
  }

  res.setHeader("Cache-Control", "public, max-age=3600");
  return res.status(200).json({ vapidPublicKey: key });
};
