/* Из конфигуратора управления освещением Maytoni (aurivio.github.io/smart-led), без изменений. */

/* Каталог оборудования Maytoni для конфигуратора управления светом.
   Источник: матрица оборудования + уточнения владельца (октябрь 2026).
   volts: {напряжение: предел, Вт}. Если напряжение не указано — устройство его не поддерживает.
   ch: число каналов (1 канал = 1 независимая зона), perCh / total: пределы нагрузки 230 В, Вт.
   phase: true — фазовое (TRIAC) управление, к нагрузке применяется коэффициент пусковых токов.
   current: [мин, макс] мА для драйверов. Блоки питания по артикулам не предлагаются. */
(function (root) {
  const RESERVE = 1.3;  // единый запас мощности 30% для всех устройств и блоков питания
  const PHASE_K = RESERVE; // для TRIAC-устройств тот же запас 30%
  const PD = (typeof module !== 'undefined' && module.exports) ? require('./pricedata.js') : root.MaytoniPriceData;

  const C = {};
  const add = (sku, data) => { C[sku] = Object.assign({ sku }, data); return sku; };
  const many = (list, data) => list.map(s => add(s, data));

  const KIT = {
    // TRIAC
    triacPanel: many(['731003', '731004', '731005'], { name: 'Роторная панель TRIAC', perCh: 200, ch: 1, phase: true }),
    triacCV: [add('731001', { name: 'Контроллер TRIAC', volts: { 12: 180, 24: 360, 48: 720 } })],
    triacPSU: PD.TRIAC_PSU.map(([sku, ser, w, ip]) => add(sku, { name: 'Источник напряжения 24 В с диммированием TRIAC (' + ser + ')', volts: { 24: w }, ip })),
    triacDriver: [
      add('PSL-TR40-150-300mA', { vout: [23, 40], name: 'Драйвер TRIAC', current: [150, 300], steps: [150, 200, 250, 300], power: [5, 12] }),
      add('PSL-TR40-300mA', { vout: [23, 40], name: 'Драйвер TRIAC', current: [300, 300], steps: [300], power: [12, 12] }),
      add('PSL-TR40-350-500mA', { vout: [23, 40], name: 'Драйвер TRIAC', current: [350, 500], steps: [350, 400, 450, 500], power: [15, 20] }),
      add('PSL-TR40-550-700mA', { vout: [23, 40], name: 'Драйвер TRIAC', current: [550, 700], steps: [550, 600, 650, 700], power: [22, 28] }),
      add('PSL-TR40-750-900mA', { vout: [23, 40], name: 'Драйвер TRIAC', current: [750, 900], steps: [750, 800, 850, 900], power: [30, 40] }),
      add('PSL-TR40-950-1200mA', { vout: [23, 40], name: 'Драйвер TRIAC', current: [950, 1200], steps: [950, 1000, 1050, 1100, 1150, 1200], power: [38, 50] })
    ],
    unity: many(['TR021-1-12B3K-W-D-B', 'TR021-1-12B4K-W-D-B', 'TR021-1-12B4K-Z-D-W', 'TR084-1-15W3K-D-W'], { name: 'Трековый светильник Unity с диммированием TRIAC' }),

    // DALI
    daliMaster: many(['721008', '721010'], { name: 'Мастер-контроллер DALI' }),
    daliPanel: [add('721042', { name: 'Панель DALI, программируемые кнопки, белая' }), add('721046', { name: 'Панель DALI, программируемые кнопки, чёрная' })],
    daliScenePanel: [add('721052', { name: 'Панель DALI для вызова сценариев (до 4)' })],
    daliRepeater: [add('721014', { name: 'Усилитель-ретранслятор DALI' })],
    daliBusPSU: many(['721009', '721012'], { name: 'Источник питания шины DALI 16 В' }),
    daliSensor: [add('727001', { name: 'Датчик движения DALI, инфракрасный' }), add('727002', { name: 'Датчик движения DALI, микроволновый' })],
    daliConverter: [add('721005', { name: 'Конвертер Wi-Fi / RF – DALI, RGB и MIX' })],
    daliRelay: [add('721021', { name: 'Релейный модуль DALI', ch: 4, total: 2760 })],
    daliPhase: [
      add('721018', { name: 'Диммер DALI DT6 TRIAC', ch: 1, perCh: 400, phase: true }),
      add('721019', { name: 'Диммер DALI DT6 TRIAC', ch: 1, perCh: 400, phase: true }),
      add('721020', { name: 'Диммер DALI DT6 TRIAC', ch: 1, perCh: 800, phase: true })
    ],
    daliDT6: [
      add('721029', { vout: [10, 42], name: 'Драйвер DALI DT6', current: [100, 500], power: [3, 10], nfc: true }),
      add('721030', { vout: [10, 42], name: 'Драйвер DALI DT6', current: [200, 700], power: [3, 15], nfc: true }),
      add('721031', { vout: [10, 42], name: 'Драйвер DALI DT6', current: [300, 850], power: [3, 25], nfc: true }),
      add('721032', { vout: [10, 42], name: 'Драйвер DALI DT6', current: [600, 1200], power: [3, 36], nfc: true }),
      add('726001', { vout: [6, 54], name: 'Драйвер DALI DT6', current: [500, 1500], nfc: true }),
      add('PSL-DL40-S-150-300mA', { vout: [23, 40], name: 'Драйвер DALI DT6', current: [150, 300], steps: [150, 200, 250, 300], power: [5, 12] }),
      add('PSL-DL40-S-300mA', { vout: [23, 40], name: 'Драйвер DALI DT6', current: [300, 300], steps: [300], power: [12, 12] }),
      add('PSL-DL40-S-350-500mA', { vout: [23, 40], name: 'Драйвер DALI DT6', current: [350, 500], steps: [350, 400, 450, 500], power: [15, 20] }),
      add('PSL-DL40-S-550-700mA', { vout: [23, 40], name: 'Драйвер DALI DT6', current: [550, 700], steps: [550, 600, 650, 700], power: [22, 28] }),
      add('PSL-DL40-S-750-900mA', { vout: [23, 40], name: 'Драйвер DALI DT6', current: [750, 900], steps: [750, 800, 850, 900], power: [30, 40] }),
      add('PSL-DL40-S-950-1200mA', { vout: [23, 40], name: 'Драйвер DALI DT6', current: [950, 1200], steps: [950, 1000, 1050, 1100, 1150, 1200], power: [42, 50] })
    ],
    daliDT8: [
      add('721025', { vout: [10, 42], name: 'Драйвер DALI DT8', current: [100, 500], power: [3, 10], nfc: true }),
      add('721026', { vout: [10, 42], name: 'Драйвер DALI DT8', current: [200, 700], power: [3, 15], nfc: true }),
      add('721022', { vout: [6, 54], name: 'Драйвер DALI DT8', current: [250, 700], power: [3, 25], nfc: true }),
      add('721027', { vout: [10, 42], name: 'Драйвер DALI DT8', current: [300, 850], power: [3, 25], nfc: true }),
      add('721028', { vout: [10, 42], name: 'Драйвер DALI DT8', current: [600, 1200], power: [3, 36], nfc: true }),
      add('721023', { vout: [6, 54], name: 'Драйвер DALI DT8', current: [500, 1400], power: [3, 45], nfc: true }),
      add('721024', { vout: [6, 54], name: 'Драйвер DALI DT8', current: [500, 1500], power: [3, 65], nfc: true }),
      add('PSL-DL40-3CCT-150-300mA', { vout: [23, 40], name: 'Драйвер DALI DT8', current: [150, 300], steps: [150, 200, 250, 300], power: [5, 12] }),
      add('PSL-DL40-3CCT-350-500mA', { vout: [23, 40], name: 'Драйвер DALI DT8', current: [350, 500], steps: [350, 400, 450, 500], power: [15, 20] }),
      add('PSL-DL40-3CCT-550-700mA', { vout: [23, 40], name: 'Драйвер DALI DT8', current: [550, 700], steps: [550, 600, 650, 700], power: [22, 28] })
    ],
    daliPSU6: PD.DALI_PSU6.map(([sku, ser, w, ip]) => add(sku, { name: 'Источник напряжения 24 В DALI DT6 (' + ser + ')', volts: { 24: w }, ip })),
    daliPSU8: PD.DALI_PSU8.map(([sku, ser, w, ip]) => add(sku, { name: 'Источник напряжения 24 В DALI DT8 (' + ser + ')', volts: { 24: w }, ip })),
    daliCV6: [add('721049', { name: 'Диммер DALI DT6', volts: { 12: 240, 24: 480, 48: 576 } })],
    daliCV8: many(['721016', '721017'], { name: 'Контроллер DALI DT8', volts: { 12: 60, 24: 120 } }),

    // Wi-Fi
    wifiSwitch: [
      add('MSN001', { name: 'Wi-Fi-выключатель', ch: 1, perCh: 100, noNeutral: true }),
      add('MSN002', { name: 'Wi-Fi-выключатель', ch: 2, perCh: 100, total: 200, noNeutral: true }),
      add('MS007', { name: 'Wi-Fi-выключатель', ch: 1, perCh: 250 }),
      add('MS008', { name: 'Wi-Fi-выключатель', ch: 2, perCh: 150 }),
      add('MD003', { name: 'Wi-Fi-выключатель', ch: 3, perCh: 150 }),
      add('MD004', { name: 'Wi-Fi-выключатель', ch: 4, perCh: 150 })
    ],
    wifiDim: [
      add('MD005', { name: 'Wi-Fi-диммер', ch: 1, perCh: 150, phase: true }),
      add('MD006', { name: 'Wi-Fi-диммер', ch: 2, perCh: 100, phase: true }),
      add('MD002', { name: 'Wi-Fi-диммер', ch: 2, perCh: 100, phase: true })
    ],
    wifiCV: [
      add('742001', { name: 'Контроллер Wi-Fi', ch: 5, perChV: true, volts: { 12: 36, 24: 72 } }),
      add('742002', { name: 'Контроллер Wi-Fi', ch: 5, perChV: true, volts: { 12: 72, 24: 144, 36: 144, 48: 192 } })
    ],
    wifiSPI: [add('711039', { name: 'Контроллер Wi-Fi–SPI', volts: { 12: 180, 24: 360 } })],

    // ZigBee
    zigHub: many(['MD-TRA034-W(N)', 'MD-TRA034-W'], { name: 'ZigBee-хаб' }),
    zigPanel: many(['DRC035-Z-8-W', 'DRC035-Z-8-B'], { name: 'Настенная панель ZigBee' }),
    zigCV: [add('771001', { name: 'Контроллер ZigBee', ch: 5, perChV: true, volts: { 12: 96, 24: 192, 36: 216, 48: 192 } })],
    zigDriver: [
      add('771003', { vout: [3, 42], name: 'Драйвер ZigBee', current: [100, 500], power: [3, 10], nfc: true }),
      add('771004', { vout: [6, 54], name: 'Драйвер ZigBee', current: [250, 700], power: [3, 25], nfc: true }),
      add('771005', { vout: [6, 54], name: 'Драйвер ZigBee', current: [500, 1500], power: [3, 65], nfc: true })
    ],

    // RF ШИМ
    rfDim: [
      add('01113', { name: 'Диммер RF', volts: { 12: 60, 24: 120 } }),
      add('01114', { name: 'Диммер RF', volts: { 12: 96, 24: 192 } }),
      add('01115', { name: 'Диммер RF', volts: { 12: 180, 24: 360 } }),
      add('731013', { name: 'Диммер RF', volts: { 12: 180, 24: 360, 48: 480 } })
    ],
    rfCCT: [
      add('01116', { name: 'Контроллер RF MIX', volts: { 12: 60, 24: 120 } }),
      add('01117', { name: 'Контроллер RF MIX', volts: { 12: 120, 24: 240 } }),
      add('01118', { name: 'Контроллер RF MIX', volts: { 12: 192, 24: 384 } })
    ],
    rfRGB: [
      add('01125', { name: 'Контроллер RF RGB', volts: { 12: 72, 24: 144 } }),
      add('01119', { name: 'Контроллер RF RGB', volts: { 12: 144, 24: 288 } })
    ],
    rfRGBW: [
      add('01121', { name: 'Контроллер RF RGBW', volts: { 12: 72, 24: 144 } }),
      add('01122', { name: 'Контроллер RF RGBW', volts: { 12: 192, 24: 384 } })
    ],
    rfRGBCCT: [add('01123', { name: 'Контроллер RF RGB+MIX', volts: { 12: 180, 24: 360 } })],
    rfRemote: {
      DIM: many(['711034', '01109', '01112'], { name: 'Пульт RF DIM' }),
      CCT: many(['711031', '01110', '01124'], { name: 'Пульт RF MIX' }),
      RGB: many(['711033', '01111'], { name: 'Пульт RF RGB' }),
      RGBW: many(['711032'], { name: 'Пульт RF RGBW / RGB+MIX' }),
      RGBCCT: ['711032']
    },
    rfPanel: {
      DIM: many(['711023', '711012', '711024'], { name: 'Роторная панель RF DIM' }),
      CCT: many(['711025', '711026'], { name: 'Роторная панель RF MIX' }),
      RGB: many(['711027', '711028'], { name: 'Роторная панель RF RGB' }),
      RGBW: [], RGBCCT: []
    },

    // Обычные блоки питания: приоритет 1 — Матрица, 2 — Новинка
    psu: PD.PSU.map(([sku, ser, v, w, ip, pr]) => add(sku, { name: 'Блок питания ' + v + ' В (' + ser + ')', series: ser, volts: { [v]: w }, ip, pr })),
    // SPI
    spi: [add('711009', { name: 'SPI-контроллер, два выхода', volts: { 12: 84, 24: 168 }, outs: 2 }), add('711010', { name: 'SPI-контроллер', volts: { 12: 96, 24: 192 } })],
    spiRemote: [add('711030', { name: 'Пульт SPI RF' })],
    spiAmp: [add('711007', { name: 'SPI-усилитель', ch: 6 }), add('711011', { name: 'SPI-усилитель', ch: 2 })]
  };

  const STRIPS_220 = Object.fromEntries((PD.STRIPS_220 || []).map(([sku, name]) => [sku, { sku, name }]));
  const STRIPS = Object.fromEntries(PD.STRIPS.map(([sku, kind, v, w, ip, name]) => { const f = (PD.STRIP_FLAGS || {})[sku]; return [sku, { sku, kind: f === 'dtw' ? 'strip_mono' : f === 'nocontrol' ? 'strip_nc' : kind, v, w, ip, name, flag: f || null }]; }));
  const LUMS = Object.fromEntries(Object.entries(PD.LUMS || {}).map(([sku, [i, w, n, fixed, name, v]]) => [sku, { sku, i, w, n, fixed: !!fixed, name, v: v || null }]));
  const STRIP_FLAGS = PD.STRIP_FLAGS || {};
  const api = { CATALOG: C, KIT, PHASE_K, RESERVE, STRIPS, STRIPS_220, LUMS, STRIP_FLAGS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MaytoniCatalog = api;
})(this);

