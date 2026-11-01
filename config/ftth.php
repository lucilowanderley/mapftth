<?php

/*
| Parâmetros padrão de cada projeto FTTH (perdas em dB, potências em dBm).
| O catálogo de cabos, splitters e OLTs fica em resources/js/lib/catalog.ts.
*/

return [
    'defaults' => [
        'olt_tx_dbm' => 5.0,
        'fusion_loss_db' => 0.1,
        'connector_loss_db' => 0.5,
        'fiber_loss_db_km' => 0.35,
        'onu_min_dbm' => -27.0,
        'onu_warn_dbm' => -25.0,
        'onu_max_dbm' => -8.0,
    ],
];
