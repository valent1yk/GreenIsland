const express = require("express");
const bodyParser = require("body-parser");
const pool = require("./db");

const app = express();
app.use(bodyParser.json());

// Tüm durakları listeleme API'si
app.get("/duraklar", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM otobus_duraklari");
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// Tüm rotaları listeleme API'si
app.get("/rotalar", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM otobus_rotalari");
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// Belirli bir rotayı görüntüleme API'si
app.get("/rota/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      "SELECT * FROM otobus_rotalari WHERE id = $1",
      [id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

app.post("/duraklar", async (req, res) => {
  const { durak_adi, koordinat_lat, koordinat_lon } = req.body;
  try {
    const result = await pool.query(
      "INSERT INTO otobus_duraklari (durak_adi, koordinat_lat, koordinat_lon) VALUES ($1, $2, $3) RETURNING *",
      [durak_adi, koordinat_lat, koordinat_lon]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

app.post("/rotalar", async (req, res) => {
  const { baslangic_durak_id, bitis_durak_id } = req.body;
  try {
    const result = await pool.query(
      "INSERT INTO otobus_rotalari (baslangic_durak_id, bitis_durak_id) VALUES ($1, $2) RETURNING *",
      [baslangic_durak_id, bitis_durak_id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

app.get("/otobus-konum", (req, res) => {
  const otobusKonumlari = [
    { id: 1, lat: 35.12345, lon: 33.91234 }, // Gazimağusa Terminali
    { id: 2, lat: 35.14012, lon: 33.91056 }, // DAÜ Kampüsü
    { id: 3, lat: 35.15034, lon: 33.92078 }, // Salamis Yolu
  ];
  res.json(otobusKonumlari);
});

// Haversine formülü ile iki koordinat arasındaki mesafeyi hesaplayan fonksiyon
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371; // Dünya'nın yarıçapı (kilometre cinsinden)
  const toRad = (value) => (value * Math.PI) / 180; // Dereceden radyana dönüşüm

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Mesafe kilometre cinsinden
}

app.get("/rota-mesafeleri", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT r.id AS rota_id,
             d1.durak_adi AS baslangic_duragi,
             d2.durak_adi AS bitis_duragi,
             r.mesafe_km AS mesafe
      FROM otobus_rotalari r
      JOIN otobus_duraklari d1 ON r.baslangic_durak_id = d1.id
      JOIN otobus_duraklari d2 ON r.bitis_durak_id = d2.id;
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

app.get("/karbon-ayak-izi/:rota_id", async (req, res) => {
  const { rota_id } = req.params;

  try {
    // Rota bilgilerini veritabanından al
    const result = await pool.query(`
      SELECT r.id AS rota_id,
             d1.durak_adi AS baslangic_duragi,
             d2.durak_adi AS bitis_duragi,
             r.mesafe_km AS mesafe
      FROM otobus_rotalari r
      JOIN otobus_duraklari d1 ON r.baslangic_durak_id = d1.id
      JOIN otobus_duraklari d2 ON r.bitis_durak_id = d2.id
      WHERE r.id = $1;
    `, [rota_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Rota bulunamadı" });
    }

    const rota = result.rows[0];
    const mesafe = rota.mesafe;

    // Karbon ayak izi hesaplamaları
    const topluTasimadaCO2 = mesafe * 0.05; // Toplu taşıma için emisyon faktörü
    const ozelAractaCO2 = mesafe * 0.21;   // Özel araç için emisyon faktörü

    res.json({
      rota_id: rota.rota_id,
      baslangic_duragi: rota.baslangic_duragi,
      bitis_duragi: rota.bitis_duragi,
      mesafe: `${mesafe.toFixed(2)} km`,
      toplu_tasima_karbon_ayak_izi: `${topluTasimadaCO2.toFixed(2)} kg CO₂`,
      ozel_arac_karbon_ayak_izi: `${ozelAractaCO2.toFixed(2)} kg CO₂`,
      fark: `${(ozelAractaCO2 - topluTasimadaCO2).toFixed(2)} kg CO₂ tasarruf`
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});
