const express = require('express');
const path = require('node:path');
const { drugs, regions } = require('./catalog');
const { getDispenseReport, getDrugSuggestions, getAvailablePeriods } = require('./powerbi');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets/fonts', express.static(path.join(__dirname, 'assets', 'fonts')));
app.use('/assets/img', express.static(path.join(__dirname, 'assets', 'img')));

app.get('/api/dispenses', async (req, res) => {
  const drugId = req.query.drug ?? 'lercanidipine';
  if (typeof drugId !== 'string') {
    return res.status(400).json({ error: 'Вибери препарат.' });
  }
  const customDrug = typeof req.query.customDrug === 'string' ? req.query.customDrug.trim() : '';
  const drug = drugId === 'custom' ? customDrug : drugs.get(drugId);
  if (!drug || drug.length > 200) {
    return res.status(400).json({ error: 'Вибери препарат або введи МНН до 200 символів.' });
  }

  const regionId = req.query.region ?? 'all';
  if (typeof regionId !== 'string' || (regionId !== 'all' && !regions.has(regionId))) {
    return res.status(400).json({ error: 'Вибери область або «Усі області».' });
  }
  const region = regionId === 'all' ? null : regions.get(regionId);

  const periods = req.query.months ?? 'all';
  if (typeof periods !== 'string' || !periods.trim()) {
    return res.status(400).json({ error: 'Вибери період погашення.' });
  }
  const months = periods === 'all' ? [] : [...new Set(periods.split(',').map((value) => value.trim()))];
  if (months.some((value) => !/^\d{4}-(0[1-9]|1[0-2])$/.test(value))) {
    return res.status(400).json({ error: 'Передай місяці у форматі 2026-09,2026-10 або all.' });
  }
  months.sort();

  try {
    const report = await getDispenseReport({ drug, region, months });
    return res.json({ ...report, filters: { drug, region, months } });
  } catch (error) {
    console.error(error);
    return res.status(502).json({ error: error.message });
  }
});

app.get('/api/suggestions/drugs', async (req, res) => {
  const term = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (term.length < 2) return res.json([]);
  if (term.length > 200) return res.status(400).json({ error: 'Введи до 200 символів.' });
  try {
    return res.json(await getDrugSuggestions(term));
  } catch (error) {
    console.error(error);
    return res.status(502).json({ error: error.message });
  }
});

app.get('/api/periods', async (req, res) => {
  try {
    return res.json(await getAvailablePeriods());
  } catch (error) {
    console.error(error);
    return res.status(502).json({ error: error.message });
  }
});

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Сервер працює на порту ${PORT}`);
  });
}

module.exports = app;
