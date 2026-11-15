/** Datos fijos transcritos del reporte de referencia; independientes de la API. */
  // Datos transcritos del reporte; independientes de la API externa.
export const exampleRotations = [
  {
    "id": 1,
    "acronym": "S1–S1",
    "crops": [
      "Soja 1ra",
      "Soja 1ra"
    ],
    "waterTable": 1.55,
    "consumption": 361.7,
    "percolation": 365.8,
    "coverage": 52,
    "rmseBefore": 0.0734,
    "rmseAfter": 0.0279,
    "stages": [
      {
        "crop": "Soja 1ra",
        "season": "2022/23",
        "yield": 5.3, "fao": 5.22, "ml": 0.08,
        "waterTable": 1.79,
        "anoxia": 0,
        "drought": 66,
        "capillary": 210.3
      },
      {
        "crop": "Soja 1ra",
        "season": "2023/24",
        "yield": 6.43, "fao": 6.12, "ml": 0.32,
        "waterTable": 1.42,
        "anoxia": 0,
        "drought": 0,
        "capillary": 151.4
      }
    ],
    "fallows": [
      {
        "days": 208,
        "evaporation": 117.1,
        "recharge": 205.3
      }
    ],
    "yield": 5.87
  },
  {
    "id": 2,
    "acronym": "T/S2–MT",
    "crops": [
      "Trigo / Soja 2da",
      "Maíz temprano"
    ],
    "waterTable": 1.23,
    "consumption": 378.3,
    "percolation": 466.2,
    "coverage": 88,
    "rmseBefore": 0.0655,
    "rmseAfter": 0.0249,
    "stages": [
      {
        "crop": "Trigo invernal",
        "season": "2022",
        "yield": 4.78, "fao": 4.5, "ml": 0.28,
        "waterTable": 1.21,
        "anoxia": 3,
        "drought": 0,
        "capillary": 168
      },
      {
        "crop": "Soja 2da",
        "season": "2022/23",
        "yield": 5.27, "fao": 5.05, "ml": 0.22,
        "waterTable": 1.96,
        "anoxia": 0,
        "drought": 74,
        "capillary": 107.6
      },
      {
        "crop": "Maíz temprano",
        "season": "2023/24",
        "yield": 16.25, "fao": 17.99, "ml": 0.43,
        "waterTable": 1.61,
        "anoxia": 0,
        "drought": 0,
        "capillary": 102.7
      }
    ],
    "fallows": [
      {
        "days": 2,
        "evaporation": 2.1,
        "recharge": 0
      },
      {
        "days": 139,
        "evaporation": 43.3,
        "recharge": 102.5
      }
    ],
    // Ajuste proporcional al cambio del maíz temprano de 18.42 a 16.25 tn/ha.
    "yield": 8.37 * (16.25 / 18.42)
  },
  {
    "id": 3,
    "acronym": "Mt–S1",
    "crops": [
      "Maíz tardío",
      "Soja 1ra"
    ],
    "waterTable": 0.87,
    "consumption": 294.3,
    "percolation": 473.4,
    "coverage": 82,
    "rmseBefore": 0.0594,
    "rmseAfter": 0.0226,
    "stages": [
      {
        "crop": "Maíz tardío",
        "season": "2022/23",
        "yield": 15.26, "fao": 15.03, "ml": 0.23,
        "waterTable": 1.88,
        "anoxia": 6,
        "drought": 84,
        "capillary": 172.4
      },
      {
        "crop": "Soja 1ra",
        "season": "2023/24",
        "yield": 4.46, "fao": 4.27, "ml": 0.19,
        "waterTable": 0.93,
        "anoxia": 10,
        "drought": 0,
        "capillary": 121.9
      }
    ],
    "fallows": [
      {
        "days": 166,
        "evaporation": 70.3,
        "recharge": 281.7
      }
    ],
    "yield": 5.89
  }
];
  // Valores aproximados transcritos de la imagen, en mm/mes.
export const climateExample = [
    {month: '2026-11', rain: 67, et0: 81}, {month: '2026-12', rain: 94, et0: 175},
    {month: '2027-01', rain: 181, et0: 132}, {month: '2027-02', rain: 127, et0: 107},
    {month: '2027-03', rain: 212.5, et0: 85}, {month: '2027-04', rain: 136.5, et0: 72}
  ];
export const balance = [
      ['Lluvia acumulada en campañas', '2.157,3 mm', 'Demanda atmosférica ET₀', '2.206,7 mm'],
      ['Transpiración del cultivo', '1.227,3 mm', 'Evaporación del suelo', '191,9 mm'],
      ['Consumo total (transpiración + evaporación)', '1.419,2 mm', 'Aporte capilar de napa', '347,3 mm'],
      ['Percolación profunda', '273,7 mm', 'Días con estrés: sequía / anegamiento', '138 / 0']
    ];
