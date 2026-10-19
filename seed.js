(function () {
  function w(id, name, detail, note) { return { id: id, name: name, detail: detail || '', note: note || '' }; }
  function ex(id, name, type, min, max, weight, unit, seedReps) {
    return {
      id: id, name: name, type: type, min: min, max: max,
      weight: weight, unit: unit,
      seedReps: seedReps == null ? null : seedReps,
      seedNote: seedReps == null ? null : 'dato inicial'
    };
  }
  function blk(id, name, rounds, exercises) { return { id: id, name: name, rounds: rounds, exercises: exercises }; }
  function it(id, name, detail) { return { id: id, name: name, detail: detail }; }

  window.SEED_ROUTINES = [
    {
      id: 'r-a', name: 'Fuerza A / Push', seedVersion: 1, warmupTitle: 'Calentamiento',
      warmup: [
        w('r-a-w1', 'Caminadora o bici suave', '3 min', 'Solo para subir temperatura. Ritmo cómodo.'),
        w('r-a-w2', 'Sentadilla al aire', '10 reps', 'Lentas, buscando buena profundidad sin forzar.'),
        w('r-a-w3', 'Arm circles', '10 adelante + 10 atrás', 'Círculos progresivamente más grandes.'),
        w('r-a-w4', 'Wall slides', '10 reps', 'Espalda contra la pared, brazos suben y bajan controlados.'),
        w('r-a-w5', 'Scapular push-ups', '10 reps', 'Brazos rectos; solo mueve las escápulas.'),
        w('r-a-w6', 'Aproximaciones', '50 / 75%', '')
      ],
      blocks: [
        blk('r-a-b1', 'Superserie A', 3, [
          ex('r-a-b1-e1', 'Prensa', 'weight', 6, 10, 84.5, 'kg', null),
          ex('r-a-b1-e2', 'Press inclinado con mancuerna', 'weight', 6, 10, 50, 'kg', 6)
        ]),
        blk('r-a-b2', 'Superserie B', 3, [
          ex('r-a-b2-e1', 'Remo sentado', 'weight', 8, 12, 125, 'lb', null),
          ex('r-a-b2-e2', 'Press de hombro en máquina', 'weight', 8, 12, 50, 'lb', 7)
        ]),
        blk('r-a-b3', 'Superserie C', 2, [
          ex('r-a-b3-e1', 'Elevaciones laterales', 'weight', 12, 15, 50, 'lb', 14),
          ex('r-a-b3-e2', 'Dead bug', 'bodyweight', 8, 12, null, null, null)
        ])
      ],
      extras: []
    },
    {
      id: 'r-b', name: 'Fuerza B / Push', seedVersion: 1, warmupTitle: 'Calentamiento',
      warmup: [
        w('r-b-w1', 'Caminadora a paso rápido', '2 min', ''),
        w('r-b-w2', 'Puente de glúteos', '15 reps', '1 min'),
        w('r-b-w3', 'Sentadillas sin peso', '12 reps', '1 min'),
        w('r-b-w4', 'Retracciones escapulares de pie', '15 reps', '1 min'),
        w('r-b-w5', 'Jalón neutro con peso ligero', '12 reps', '1 min'),
        w('r-b-w6', 'Sentadilla búlgara sin peso', '8 reps por pierna', '2 min')
      ],
      blocks: [
        blk('r-b-b1', 'Superserie A', 3, [
          ex('r-b-b1-e1', 'Sentadilla búlgara', 'weight', 8, 12, 70, 'lb', 11),
          ex('r-b-b1-e2', 'Jalón neutro', 'weight', 6, 10, 90, 'lb', null)
        ]),
        blk('r-b-b2', 'Superserie B', 3, [
          ex('r-b-b2-e1', 'Hip thrust', 'weight', 8, 12, 34.5, 'kg', 11),
          ex('r-b-b2-e2', 'Press de pecho en máquina', 'weight', 8, 12, 90, 'lb', null)
        ]),
        blk('r-b-b3', 'Superserie C', 2, [
          ex('r-b-b3-e1', 'Remo sentado', 'weight', 8, 12, 130, 'lb', 8),
          ex('r-b-b3-e2', 'Curl de bíceps', 'weight', 10, 15, 60, 'lb', 11)
        ])
      ],
      extras: []
    },
    {
      id: 'r-c', name: 'Fuerza C / énfasis Legs', seedVersion: 1, warmupTitle: 'Calentamiento — 8 min',
      warmup: [
        w('r-c-w1', 'Caminadora o bicicleta', '2 min', 'Ritmo ligero-moderado. Solo busca subir temperatura.'),
        w('r-c-w2', 'Sentadilla con peso corporal', '10 reps', 'Baja controlado y sube normal. No necesitas profundidad máxima.'),
        w('r-c-w3', 'Good morning sin peso', '10 reps', 'Manos en el pecho, rodillas ligeramente flexionadas y lleva la cadera hacia atrás. Objetivo: preparar exactamente el patrón del peso muerto rumano.'),
        w('r-c-w4', 'Reverse lunge alternado', '6 por pierna', 'Paso hacia atrás, movimiento tranquilo y estable.'),
        w('r-c-w5', 'Glute bridge', '12 reps', 'Pausa de 1 segundo arriba. No hace falta apretar exageradamente.'),
        w('r-c-w6', 'Remo sentado muy ligero', '12 reps', 'Una serie sencilla para preparar espalda y hombros para remo + press.'),
        w('r-c-w7', 'Series de aproximación de hack squat/prensa', '2 series', 'Serie 1: 10 reps muy ligeras. Serie 2: 6 reps con ~50–60% de tu peso de trabajo.')
      ],
      blocks: [
        blk('r-c-b1', 'Superserie A', 3, [
          ex('r-c-b1-e1', 'Prensa', 'weight', 6, 10, 89, 'kg', null),
          ex('r-c-b1-e2', 'Remo sentado', 'weight', 8, 12, 130, 'lb', 9)
        ]),
        blk('r-c-b2', 'Superserie B', 3, [
          ex('r-c-b2-e1', 'Peso muerto rumano', 'weight', 8, 10, 80, 'lb', 10),
          ex('r-c-b2-e2', 'Press con mancuernas', 'weight', 8, 12, 40, 'kg', null)
        ]),
        blk('r-c-b3', 'Superserie C', 2, [
          ex('r-c-b3-e1', 'Curl femoral', 'weight', 10, 15, 70, 'lb', 12),
          ex('r-c-b3-e2', 'Farmer carry', 'time', 30, 45, 70, 'lb', null)
        ])
      ],
      extras: [
        {
          id: 'r-c-x1', title: 'Movilidad — 7 min', items: [
            it('r-c-x1-i1', 'Knee-to-wall', '1 min/lado'),
            it('r-c-x1-i2', '90/90', '1 min'),
            it('r-c-x1-i3', 'Couch stretch', '1 min/lado'),
            it('r-c-x1-i4', 'Open book', '1 min/lado')
          ]
        },
        {
          id: 'r-c-x2', title: 'Balance — 3 min', items: [
            it('r-c-x2-i1', 'Single-leg stand', '45 s/lado'),
            it('r-c-x2-i2', 'Single-leg reach', '6/lado')
          ]
        }
      ]
    }
  ];
})();
