import { defineConfig } from 'vitest/config';

// Configuração própria para os testes, sem o plugin do Laravel (que bloqueia execução em CI).
export default defineConfig({
    test: {
        include: ['tests/js/**/*.test.ts'],
    },
});
