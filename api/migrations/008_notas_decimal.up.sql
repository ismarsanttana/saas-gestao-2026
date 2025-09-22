ALTER TABLE notas DROP CONSTRAINT IF EXISTS notas_nota_check;
ALTER TABLE notas ADD CONSTRAINT notas_nota_check CHECK (nota >= 0 AND nota <= 10);
