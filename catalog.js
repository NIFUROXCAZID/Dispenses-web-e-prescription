const regions = new Map([
  ['vinnytska', 'ВІННИЦЬКА'],
  ['volynska', 'ВОЛИНСЬКА'],
  ['dnipropetrovska', 'ДНІПРОПЕТРОВСЬКА'],
  ['donetska', 'ДОНЕЦЬКА'],
  ['zhytomyrska', 'ЖИТОМИРСЬКА'],
  ['zakarpatska', 'ЗАКАРПАТСЬКА'],
  ['zaporizka', 'ЗАПОРІЗЬКА'],
  ['ivano-frankivska', 'ІВАНО-ФРАНКІВСЬКА'],
  ['kyivska', 'КИЇВСЬКА'],
  ['kirovohradska', 'КІРОВОГРАДСЬКА'],
  ['luhanska', 'ЛУГАНСЬКА'],
  ['lvivska', 'ЛЬВІВСЬКА'],
  ['kyiv', 'М.КИЇВ'],
  ['mykolaivska', 'МИКОЛАЇВСЬКА'],
  ['odeska', 'ОДЕСЬКА'],
  ['poltavska', 'ПОЛТАВСЬКА'],
  ['rivnenska', 'РІВНЕНСЬКА'],
  ['sumska', 'СУМСЬКА'],
  ['ternopilska', 'ТЕРНОПІЛЬСЬКА'],
  ['kharkivska', 'ХАРКІВСЬКА'],
  ['khersonska', 'ХЕРСОНСЬКА'],
  ['khmelnytska', 'ХМЕЛЬНИЦЬКА'],
  ['cherkaska', 'ЧЕРКАСЬКА'],
  ['chernivetska', 'ЧЕРНІВЕЦЬКА'],
  ['chernihivska', 'ЧЕРНІГІВСЬКА'],
]);

const drugs = new Map([
  ['lercanidipine', 'лерканідипін'],
  ['eplerenone', 'еплеренон'],
  ['indapamide-perindopril', 'індапамід; периндоприл'],
  ['amlodipine-indapamide-perindopril', 'амлодипін; індапамід; периндоприл'],
  ['ezetimibe-rosuvastatin', 'езетиміб; розувастатин'],
  ['aspirin-rosuvastatin', 'кислота ацетилсаліцилова; розувастатин'],
]);

module.exports = { regions, drugs };
