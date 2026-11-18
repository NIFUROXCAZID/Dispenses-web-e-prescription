const QUERY_URL = 'https://wabi-west-europe-b-primary-api.analysis.windows.net/public/reports/querydata?synchronous=true';
const TABLE_VISUAL = '263f4f5fb72624863a01';
const MONTH_NAMES = [
  'січень', 'лютий', 'березень', 'квітень', 'травень', 'червень',
  'липень', 'серпень', 'вересень', 'жовтень', 'листопад', 'грудень',
];

function column(source, property) {
  return { Column: { Expression: { SourceRef: { Source: source } }, Property: property } };
}

function measure(source, property) {
  return { Measure: { Expression: { SourceRef: { Source: source } }, Property: property } };
}

function literal(value) {
  return { Literal: { Value: value } };
}

function quoted(value) {
  return "'" + value.replaceAll("'", "''") + "'";
}

function inFilter(expression, values) {
  return {
    Condition: {
      In: {
        Expressions: [expression],
        Values: values.map((value) => [literal(quoted(value))]),
      },
    },
  };
}

function positive(expression) {
  return {
    Condition: {
      Comparison: {
        ComparisonKind: 1,
        Left: expression,
        Right: literal('0L'),
      },
    },
  };
}

function createBody(command, visualId) {
  return {
    version: '1.0.0',
    queries: [{
      Query: { Commands: [{ SemanticQueryDataShapeCommand: command }] },
      QueryId: '',
      ApplicationContext: {
        DatasetId: '1a5018b6-0f5a-4178-9b2a-e6c03244957e',
        Sources: [{
          ReportId: 'e99d7419-8c68-4461-8add-1f75cda347c9',
          VisualId: visualId,
        }],
      },
    }],
    cancelQueries: [],
    modelId: 2821981,
  };
}

function monthFilter(months) {
  return {
    Condition: {
      In: {
        Expressions: [column('c', 'Year'), column('c', 'Quarter'), column('c', 'Month')],
        Values: months.map((period) => {
          const [year, month] = period.split('-').map(Number);
          const quarter = Math.ceil(month / 3);
          return [
            literal(year + 'L'),
            literal(quoted(quarter + ' кв.')),
            literal(quoted(MONTH_NAMES[month - 1])),
          ];
        }),
      },
    },
  };
}

function createTableCommand({ drug, region, months }) {
  const dimensions = [
    column('d', 'area'),
    column('d2', 'full_inn_name'),
    column('d2', 'Торгова назва повна'),
  ];
  const count = measure('d1', 'Погашено рецептів (дин)');

  return {
    Query: {
      Version: 2,
      From: [
        { Name: 'd', Entity: 'dim_divisions', Type: 0 },
        { Name: 'd1', Entity: 'DAX', Type: 0 },
        { Name: 'd2', Entity: 'dim_medications', Type: 0 },
        { Name: 'п', Entity: 'Параметр показників (формат)', Type: 0 },
        { Name: 'c', Entity: 'CALENDAR', Type: 0 },
        { Name: 'п1', Entity: 'Параметр таблиці (рядки)', Type: 0 },
        { Name: 'п2', Entity: 'Параметр таблиці (стовпці)', Type: 0 },
        { Name: 'f', Entity: 'fct_dispenses', Type: 0 },
      ],
      Select: [
        { ...dimensions[0], Name: 'dim_divisions.area' },
        { ...count, Name: 'DAX.Погашено рецептів' },
        { ...measure('d1', 'Відпущено упаковок (дин)'), Name: 'DAX.Відпущено упаковок (дин)' },
        { ...measure('d1', 'Відпущено добових доз (дин)'), Name: 'DAX.Відпущено добових доз (дин)' },
        { ...dimensions[1], Name: 'dim_medications.full_inn_name' },
        { ...dimensions[2], Name: 'dim_medications.Торгова назва повна' },
      ],
      Where: [
        { ...positive(count), Target: dimensions },
        inFilter(column('п', 'Параметр Поля'), [
          "'DAX'[Погашено рецептів (дин)]",
          "'DAX'[Відпущено упаковок (дин)]",
          "'DAX'[Відпущено добових доз (дин)]",
        ]),
        ...(months.length ? [monthFilter(months)] : []),
        inFilter(column('п1', 'Параметр Поля'), [
          "'dim_divisions'[area]",
          "'dim_medications'[full_inn_name]",
          "'dim_medications'[Торгова назва повна]",
        ]),
        inFilter(column('d2', 'МНН'), [drug]),
        inFilter(column('п2', 'Параметр Поля'), ["'dim_medical_programs'[funds]"]),
        ...(region ? [inFilter(column('d', 'area'), [region])] : []),
        positive(column('f', 'Кількість погашених рецептів')),
      ],
      OrderBy: dimensions.map((expression) => ({ Direction: 1, Expression: expression })),
    },
    Binding: {
      Primary: { Groupings: [{ Projections: [0, 1, 2, 3, 4, 5], Subtotal: 1 }] },
      DataReduction: { DataVolume: 3, Primary: { Window: { Count: 500 } } },
      Version: 1,
    },
    ExecutionMetricsKind: 1,
  };
}

// Відновлюємо повтори (R), порожні значення (Ø) та індекси словників (DN).
function decodeMember(dataset, member) {
  const records = (dataset.PH ?? []).flatMap((group) => group[member] ?? []);
  let schema = [];
  let previous = {};

  return records.map((record) => {
    schema = record.S ?? schema;
    if (!schema.length) throw new Error('Power BI повернув рядок без схеми.');
    let cursor = 0;
    const row = {};

    for (const [index, field] of schema.entries()) {
      const bit = 1 << index;
      if ((record['Ø'] ?? 0) & bit) {
        row[field.N] = null;
        continue;
      }
      if ((record.R ?? 0) & bit) {
        if (!Object.hasOwn(previous, field.N)) {
          throw new Error('Не вдалося відновити повторюване значення Power BI.');
        }
        row[field.N] = previous[field.N];
        continue;
      }

      let value = Array.isArray(record.C) ? record.C[cursor++] : record[field.N];
      if (field.DN && Number.isInteger(value)) {
        const dictionary = dataset.ValueDicts?.[field.DN];
        if (!dictionary || !Object.hasOwn(dictionary, value)) {
          throw new Error('Power BI повернув невідомий індекс словника.');
        }
        value = dictionary[value];
      }
      row[field.N] = value ?? null;
    }

    previous = row;
    return row;
  });
}

async function requestPowerBi(command, visualId) {
  const key = process.env.NSZU_DISPENSES_RESOURCE_KEY;
  if (!key) throw new Error('Задай NSZU_DISPENSES_RESOURCE_KEY перед запуском.');

  const response = await fetch(QUERY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-PowerBI-ResourceKey': key },
    body: JSON.stringify(createBody(command, visualId)),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error('Power BI повернув HTTP ' + response.status);

  const json = await response.json();
  const data = json.results?.[0]?.result?.data;
  const dataset = data?.dsr?.DS?.[0];
  if (!dataset || !data.descriptor?.Select) {
    throw new Error('Power BI не повернув очікуваний набір даних.');
  }
  return { dataset, descriptor: data.descriptor };
}

// Для наступної сторінки передаємо токен, який повернув Power BI.
async function requestAllRows(command, visualId) {
  const rows = [];
  const seenTokens = new Set();
  let firstPage;

  while (true) {
    const page = await requestPowerBi(command, visualId);
    firstPage ??= page;
    const grouping = page.descriptor.Expressions?.Primary?.Groupings?.[0];
    const member = grouping?.Member ?? 'DM0';
    const records = decodeMember(page.dataset, member);
    const names = page.descriptor.Select;

    for (const record of records) {
      rows.push(names.map((field) => record[field.Value] ?? null));
    }

    const tokens = page.dataset.RT;
    if (!Array.isArray(tokens) || tokens.length === 0) break;
    const signature = JSON.stringify(tokens);
    if (seenTokens.has(signature) || records.length === 0) {
      throw new Error('Power BI не зміг завантажити наступну сторінку. Повтори запит.');
    }
    seenTokens.add(signature);
    command.Binding.DataReduction.Primary.Window.RestartTokens = tokens;
  }

  return { rows, firstPage };
}

function numeric(value) {
  if (value === null) return null;
  if (!Number.isFinite(value)) throw new Error('Power BI повернув некоректний числовий показник.');
  return value;
}

async function getDispenseReport(filters) {
  const result = await requestAllRows(createTableCommand(filters), TABLE_VISUAL);
  const rows = result.rows.map(([region, prescriptions, packages, dailyDoses, inn, tradeName]) => ({
    region,
    inn,
    tradeName,
    prescriptions: numeric(prescriptions),
    packages: numeric(packages),
    dailyDoses: numeric(dailyDoses),
  }));
  const collator = new Intl.Collator('uk');
  rows.sort((a, b) =>
    collator.compare(a.region ?? '', b.region ?? '')
    || collator.compare(a.inn ?? '', b.inn ?? '')
    || collator.compare(a.tradeName ?? '', b.tradeName ?? ''));

  const { dataset, descriptor } = result.firstPage;
  const grouping = descriptor.Expressions?.Primary?.Groupings?.[0];
  let totals = null;
  if (grouping?.SubtotalMember) {
    const total = decodeMember(dataset, grouping.SubtotalMember)[0];
    if (total) {
      const values = descriptor.Select.map((field) => total[field.Subtotal?.[0]] ?? null);
      totals = {
        prescriptions: numeric(values[1]),
        packages: numeric(values[2]),
        dailyDoses: numeric(values[3]),
      };
    }
  }
  return { rows, totals };
}

async function getDrugSuggestions(term) {
  const field = column('m', 'МНН');
  const command = {
    Query: {
      Version: 2,
      From: [{ Name: 'm', Entity: 'dim_medications', Type: 0 }],
      Select: [{ ...field, Name: 'dim_medications.МНН' }],
      Where: [{ Condition: { Contains: { Left: field, Right: literal(quoted(term)) } } }],
      OrderBy: [{ Direction: 1, Expression: field }],
    },
    Binding: {
      Primary: { Groupings: [{ Projections: [0] }] },
      DataReduction: { DataVolume: 3, Primary: { Top: { Count: 15 } } },
      Version: 1,
    },
    ExecutionMetricsKind: 1,
  };
  const { dataset, descriptor } = await requestPowerBi(command, TABLE_VISUAL);
  const member = descriptor.Expressions?.Primary?.Groupings?.[0]?.Member ?? 'DM0';
  const names = decodeMember(dataset, member).map((row) => row[descriptor.Select[0].Value]);
  return [...new Set(names.filter((name) => typeof name === 'string' && name.trim()))];
}

async function getAvailablePeriods() {
  const fields = ['Year', 'Quarter', 'Month'].map((property) => column('c', property));
  const command = {
    Query: {
      Version: 2,
      From: [
        { Name: 'c', Entity: 'CALENDAR', Type: 0 },
        { Name: 'd', Entity: 'DAX', Type: 0 },
      ],
      Select: fields.map((field, index) => ({ ...field, Name: 'period' + index })),
      Where: [{ ...positive(measure('d', 'Погашено рецептів')), Target: fields }],
      OrderBy: fields.map((field) => ({ Direction: 1, Expression: field })),
    },
    Binding: {
      Primary: { Groupings: [{ Projections: [0, 1, 2] }] },
      DataReduction: { DataVolume: 3, Primary: { Window: { Count: 500 } } },
      Version: 1,
    },
    ExecutionMetricsKind: 1,
  };
  const { rows } = await requestAllRows(command, '3c89c887d82d92b785b5');
  const periods = rows.map(([rawYear, rawQuarter, rawMonth]) => {
    const year = Number(rawYear);
    const month = MONTH_NAMES.indexOf(String(rawMonth).trim().toLowerCase()) + 1;
    const quarter = Math.ceil(month / 3);
    if (!Number.isInteger(year) || month === 0 || rawQuarter !== quarter + ' кв.') {
      throw new Error('Не вдалося розпізнати період Power BI.');
    }
    return { value: year + '-' + String(month).padStart(2, '0'), year, quarter, month };
  });
  return periods.sort((a, b) => a.year - b.year || a.month - b.month);
}

module.exports = { getDispenseReport, getDrugSuggestions, getAvailablePeriods };
