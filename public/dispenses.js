(() => {
  'use strict';

  const drugSelect = document.querySelector('#drug');
  const customDrugField = document.querySelector('#custom-drug-field');
  const customDrugInput = document.querySelector('#custom-drug');
  const drugSuggestions = document.querySelector('#drug-suggestions');
  const regionSelect = document.querySelector('#region');
  const loadButton = document.querySelector('#load-dispenses');
  const downloadButton = document.querySelector('#download-dispenses');
  const status = document.querySelector('#status');
  const results = document.querySelector('#dispenses-results');
  const tableBody = document.querySelector('#dispense-rows');
  const tableTotals = document.querySelector('#dispense-totals');
  const periodPicker = document.querySelector('#period-picker');
  const periodToggle = document.querySelector('#period-toggle');
  const periodPanel = document.querySelector('#period-panel');
  const periodValue = document.querySelector('#period-value');
  const periodTree = document.querySelector('#period-tree');
  const periodFeedback = document.querySelector('#period-feedback');
  const retryPeriods = document.querySelector('#retry-periods');
  const allPeriodsInput = document.querySelector('#all-periods');

  const monthNames = [
    'січень', 'лютий', 'березень', 'квітень', 'травень', 'червень',
    'липень', 'серпень', 'вересень', 'жовтень', 'листопад', 'грудень',
  ];
  const numberFormatter = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 10 });
  const selectedMonths = new Set();
  const selectionControls = [];
  let availablePeriods = [];
  let periodsLoading = false;
  let reportLoading = false;
  let exporting = false;
  let loadedReport = null;
  let suggestionTimer;
  let suggestionController;

  function updateButtons() {
    loadButton.disabled = reportLoading || exporting || periodsLoading || availablePeriods.length === 0;
    downloadButton.disabled = reportLoading || exporting || !loadedReport?.rows.length;
  }

  function openPeriodPanel(open) {
    periodPanel.hidden = !open;
    periodToggle.setAttribute('aria-expanded', String(open));
  }

  periodToggle.addEventListener('click', () => openPeriodPanel(periodPanel.hidden));
  document.addEventListener('click', (event) => {
    if (!periodPicker.contains(event.target)) openPeriodPanel(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !periodPanel.hidden) {
      openPeriodPanel(false);
      periodToggle.focus();
    }
  });

  function describePeriods(values) {
    const sorted = [...values].sort();
    const runs = [];
    for (const value of sorted) {
      const [year, month] = value.split('-').map(Number);
      const serial = year * 12 + month - 1;
      const last = runs[runs.length - 1];
      if (last && serial === last.end + 1) {
        last.end = serial;
      } else {
        runs.push({ start: serial, end: serial });
      }
    }
    return runs.map(({ start, end }) => {
      const startYear = Math.floor(start / 12);
      const endYear = Math.floor(end / 12);
      const startMonth = start % 12;
      const endMonth = end % 12;
      if (start === end) return monthNames[startMonth] + ' ' + startYear;
      if (startYear === endYear) {
        if (startMonth === 0 && endMonth === 11) return startYear + ' рік';
        return monthNames[startMonth] + ' — ' + monthNames[endMonth] + ' ' + startYear;
      }
      return monthNames[startMonth] + ' ' + startYear + ' — ' + monthNames[endMonth] + ' ' + endYear;
    }).join(', ');
  }

  function updatePeriodSelection() {
    for (const { input, values } of selectionControls) {
      const count = values.filter((value) => selectedMonths.has(value)).length;
      input.checked = count === values.length;
      input.indeterminate = count > 0 && count < values.length;
    }
    const allSelected = availablePeriods.length > 0 && selectedMonths.size === availablePeriods.length;
    allPeriodsInput.checked = allSelected;
    allPeriodsInput.indeterminate = selectedMonths.size > 0 && !allSelected;
    let label = 'Оберіть період';
    if (selectedMonths.size > 0) {
      label = allSelected ? 'Усі періоди' : describePeriods(selectedMonths);
    }
    periodValue.textContent = label;
    periodToggle.title = describePeriods(selectedMonths);
    periodFeedback.textContent = selectedMonths.size ? '' : 'Познач хоча б один місяць, квартал або рік.';
  }

  function createPeriodCheckbox(label, values) {
    const wrapper = document.createElement('label');
    wrapper.className = 'period-picker__check';
    const input = document.createElement('input');
    input.type = 'checkbox';
    const text = document.createElement('span');
    text.textContent = label;
    wrapper.append(input, text);
    selectionControls.push({ input, values });
    input.addEventListener('change', () => {
      for (const value of values) {
        if (input.checked) selectedMonths.add(value);
        else selectedMonths.delete(value);
      }
      updatePeriodSelection();
    });
    return wrapper;
  }

  function createPeriodBranch(label, values, id, expanded) {
    const node = document.createElement('div');
    node.className = 'period-node';
    const heading = document.createElement('div');
    heading.className = 'period-node__heading';
    const branch = document.createElement('button');
    branch.type = 'button';
    branch.className = 'period-node__branch';
    branch.setAttribute('aria-label', 'Розгорнути або згорнути ' + label);
    branch.setAttribute('aria-expanded', String(expanded));
    branch.setAttribute('aria-controls', id);
    const children = document.createElement('div');
    children.className = 'period-node__children';
    children.id = id;
    children.hidden = !expanded;
    branch.addEventListener('click', () => {
      children.hidden = !children.hidden;
      branch.setAttribute('aria-expanded', String(!children.hidden));
    });
    heading.append(branch, createPeriodCheckbox(label, values));
    node.append(heading, children);
    return { node, children };
  }

  function renderPeriodTree() {
    const years = [...new Set(availablePeriods.map((period) => period.year))].sort((a, b) => b - a);
    const fragment = document.createDocumentFragment();
    selectionControls.length = 0;
    for (const year of years) {
      const periods = availablePeriods.filter((period) => period.year === year);
      const expanded = periods.some((period) => selectedMonths.has(period.value));
      const yearBranch = createPeriodBranch(year + ' рік', periods.map((period) => period.value), 'period-year-' + year, expanded);
      for (let quarter = 1; quarter <= 4; quarter++) {
        const quarterPeriods = periods.filter((period) => period.quarter === quarter);
        if (quarterPeriods.length === 0) continue;
        const quarterBranch = createPeriodBranch(quarter + ' квартал', quarterPeriods.map((period) => period.value), `period-quarter-${year}-${quarter}`, false);
        for (const period of quarterPeriods) {
          quarterBranch.children.append(createPeriodCheckbox(monthNames[period.month - 1], [period.value]));
        }
        yearBranch.children.append(quarterBranch.node);
      }
      fragment.append(yearBranch.node);
    }
    periodTree.replaceChildren(fragment);
    updatePeriodSelection();
  }

  allPeriodsInput.addEventListener('change', () => {
    selectedMonths.clear();
    if (allPeriodsInput.checked) {
      for (const period of availablePeriods) selectedMonths.add(period.value);
    }
    updatePeriodSelection();
  });

  async function fetchJson(url, options) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || 'HTTP ' + response.status);
    if (data === null) throw new Error('Сервер повернув некоректну відповідь.');
    return data;
  }

  async function loadPeriods() {
    periodsLoading = true;
    updateButtons();
    retryPeriods.hidden = true;
    periodValue.textContent = 'Завантаження періодів…';
    periodFeedback.textContent = 'Завантаження…';
    try {
      const periods = await fetchJson('/api/periods');
      if (!Array.isArray(periods) || periods.length === 0) throw new Error('НСЗУ не повернула доступних періодів.');
      availablePeriods = periods.sort((a, b) => a.year - b.year || a.month - b.month);
      selectedMonths.clear();
      const currentYear = new Date().getFullYear();
      const latestYear = availablePeriods[availablePeriods.length - 1].year;
      const initialYear = availablePeriods.some((period) => period.year === currentYear) ? currentYear : latestYear;
      for (const period of availablePeriods) {
        if (period.year === initialYear) selectedMonths.add(period.value);
      }
      allPeriodsInput.disabled = false;
      renderPeriodTree();
    } catch (error) {
      periodValue.textContent = 'Не вдалося завантажити періоди';
      periodFeedback.textContent = error.message;
      retryPeriods.hidden = false;
    } finally {
      periodsLoading = false;
      updateButtons();
    }
  }

  retryPeriods.addEventListener('click', loadPeriods);

  function updateDrugField() {
    customDrugField.hidden = drugSelect.value !== 'custom';
    clearTimeout(suggestionTimer);
    suggestionController?.abort();
    drugSuggestions.replaceChildren();
  }
  drugSelect.addEventListener('change', updateDrugField);
  updateDrugField();

  customDrugInput.addEventListener('input', () => {
    clearTimeout(suggestionTimer);
    suggestionController?.abort();
    drugSuggestions.replaceChildren();
    const term = customDrugInput.value.trim();
    if (term.length < 2) return;
    suggestionTimer = setTimeout(async () => {
      const request = new AbortController();
      suggestionController = request;
      try {
        const params = new URLSearchParams({ q: term });
        const names = await fetchJson('/api/suggestions/drugs?' + params, { signal: request.signal });
        if (request.signal.aborted || customDrugInput.value.trim() !== term || !Array.isArray(names)) return;
        const options = names.filter((name) => typeof name === 'string').map((name) => {
          const option = document.createElement('option');
          option.value = name;
          return option;
        });
        drugSuggestions.replaceChildren(...options);
      } catch (error) {
        if (error.name !== 'AbortError') console.warn('Не вдалося завантажити підказки МНН', error);
      }
    }, 80);
  });

  function formatNumber(value) {
    return value == null ? '—' : numberFormatter.format(value);
  }

  function toggleRow(row) {
    if (window.getSelection()?.type === 'Range') return;
    const expanded = row.classList.toggle('is-expanded');
    for (const text of row.querySelectorAll('.table-text')) text.classList.toggle('table-text--expanded', expanded);
    for (const button of row.querySelectorAll('.table-text-button')) button.setAttribute('aria-expanded', String(expanded));
  }

  function createDataRow(record) {
    const row = document.createElement('tr');
    const values = [
      record.region,
      record.inn,
      record.tradeName,
      record.prescriptions,
      record.packages,
    ];
    for (const [index, value] of values.entries()) {
      const cell = document.createElement('td');
      if (index < 3) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'table-text-button';
        button.setAttribute('aria-expanded', 'false');
        const text = document.createElement('span');
        text.className = 'table-text';
        text.textContent = value ?? '—';
        button.append(text);
        cell.append(button);
      } else {
        cell.textContent = formatNumber(value);
      }
      row.append(cell);
    }
    row.addEventListener('click', () => toggleRow(row));
    return row;
  }

  function renderTotals(totals) {
    tableTotals.replaceChildren();
    tableTotals.hidden = !totals;

    if (!totals) return;

    const values = [
      ['Усього погашено рецептів', totals.prescriptions],
      ['Усього відпущено упаковок', totals.packages],
    ];

    for (const [label, value] of values) {
      const paragraph = document.createElement('p');
      paragraph.textContent = `${label} — ${formatNumber(value)}`;
      tableTotals.append(paragraph);
    }
  }

  loadButton.addEventListener('click', async () => {
    const months = [...selectedMonths].sort();
    if (months.length === 0) {
      status.textContent = 'Вибери період погашення.';
      openPeriodPanel(true);
      allPeriodsInput.focus();
      return;
    }
    const customDrug = customDrugInput.value.trim();
    if (drugSelect.value === 'custom' && !customDrug) {
      status.textContent = 'Введи назву лікарського засобу (МНН).';
      customDrugInput.focus();
      return;
    }
    const params = new URLSearchParams({ drug: drugSelect.value, region: regionSelect.value, months: months.join(',') });
    if (drugSelect.value === 'custom') params.set('customDrug', customDrug);
    // Фіксуємо фільтри до запиту, щоб Excel відповідав завантаженим даним.
    const details = {
      drug: drugSelect.value === 'custom' ? customDrug : drugSelect.selectedOptions[0].textContent.trim(),
      region: regionSelect.selectedOptions[0].textContent.trim(),
      period: describePeriods(months),
      months,
    };
    reportLoading = true;
    updateButtons();
    openPeriodPanel(false);
    results.setAttribute('aria-busy', 'true');
    status.textContent = 'Завантаження статистики…';
    try {
      const report = await fetchJson('/api/dispenses?' + params);
      if (!Array.isArray(report.rows)) throw new Error('У відповіді сервера немає рядків таблиці.');
      const rows = report.rows.map(createDataRow);
      tableBody.replaceChildren(...rows);
      renderTotals(report.totals);
      loadedReport = { rows: report.rows, totals: report.totals, details };
      results.hidden = false;
      status.textContent = 'Знайдено рядків — ' + rows.length;
    } catch (error) {
      status.textContent = 'Не вдалося завантажити статистику. ' + error.message;
    } finally {
      reportLoading = false;
      results.setAttribute('aria-busy', 'false');
      updateButtons();
    }
  });

  function addExcelMetadata(sheet, label, value) {
    const row = sheet.addRow([label, value]);
    sheet.mergeCells(row.number, 2, row.number, 6);
    row.getCell(1).font = { bold: true };
    const lines = Math.max(Math.ceil(label.length / 19), Math.ceil(value.length / 130));
    row.height = Math.max(24, lines * 15 + 8);
  }

  downloadButton.addEventListener('click', async () => {
    if (!loadedReport?.rows.length) return;
    const report = loadedReport;
    exporting = true;
    updateButtons();
    try {
      if (typeof ExcelJS === 'undefined') throw new Error('Бібліотека Excel ще не завантажилася. Онови сторінку та повтори.');
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Погашені рецепти');
      const widths = [24, 48, 65, 22, 23];
      sheet.columns = widths.map((width) => ({ width }));
      // Перший рядок: препарат, область і сортування.
      const infoRow = sheet.addRow([
        `Препарат: ${report.details.drug}`, null,
        `Область: ${report.details.region}`,
        'Посортовано за: Областями', null,
      ]);

      sheet.mergeCells(infoRow.number, 1, infoRow.number, 2);
      sheet.mergeCells(infoRow.number, 4, infoRow.number, 5);
      infoRow.height = 26;

      // Другий рядок: період.
      const periodText = `Період погашення: ${report.details.period}`;
      const periodRow = sheet.addRow([periodText]);

      sheet.mergeCells(periodRow.number, 1, periodRow.number, 5);
      periodRow.height = Math.max(
        22,
        Math.ceil(periodText.length / 180) * 15 + 6,
      );

      // Третій рядок: підсумки.
      if (report.totals) {
        const { prescriptions, packages } = report.totals;

        const totalRow = sheet.addRow([
          'Усього за вибраний період', null, null,
          prescriptions, packages,
        ]);

        sheet.mergeCells(totalRow.number, 1, totalRow.number, 3);
        totalRow.font = { bold: true };
        totalRow.height = 22;
      }
      const header = sheet.addRow([
        'Область',
        'МНН, лікарська форма',
        'Торгова назва повна',
        'Погашено рецептів',
        'Відпущено упаковок',
      ]);
      header.font = { bold: true };
      header.height = 26;
      header.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE1EBFB' } };
      });
      sheet.views = [{ state: 'frozen', ySplit: header.number }];
      for (const record of report.rows) {
        const texts = [record.region ?? '—', record.inn ?? '—', record.tradeName ?? '—'];
        const row = sheet.addRow([
          ...texts,
          record.prescriptions,
          record.packages,
        ]);
        const lines = Math.max(...texts.map((text, index) => Math.ceil(text.length / (widths[index] * 0.85))));
        row.height = Math.max(24, lines * 15 + 8);
      }
      sheet.autoFilter = { from: { row: header.number, column: 1 }, to: { row: header.number + report.rows.length, column: 5 } };
      for (const index of [4, 5]) {
        sheet.getColumn(index).numFmt = '#,##0.##########';
      }
      sheet.eachRow((row) => {
        row.alignment = { vertical: 'middle', wrapText: true };
      });
      const buffer = await workbook.xlsx.writeBuffer();
      const file = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'Погашені-рецепти.xlsx';
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      status.textContent = 'Не вдалося створити файл Excel. ' + error.message;
    } finally {
      exporting = false;
      updateButtons();
    }
  });

  loadPeriods();
})();
