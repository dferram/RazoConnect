module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Tipos permitidos
    'type-enum': [
      2,
      'always',
      [
        'feat',     // Nueva funcionalidad
        'fix',      // Corrección de bug
        'chore',    // Tareas de mantenimiento
        'docs',     // Documentación
        'style',    // Formato, sin cambios de lógica
        'refactor', // Refactorización
        'test',     // Tests
        'perf',     // Performance
        'ci',       // CI/CD
        'revert',   // Revertir commit
        'build',    // Build system
        'security', // Cambios de seguridad
      ],
    ],
    // El subject no puede terminar en punto
    'subject-full-stop': [2, 'never', '.'],
    // El subject debe estar en minúsculas
    'subject-case': [0], // desactivado — permite español
    // Longitud máxima del header
    'header-max-length': [2, 'always', 100],
  },
};
