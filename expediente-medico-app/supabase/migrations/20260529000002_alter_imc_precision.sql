-- Alter imc column type to NUMERIC(4,1) to support higher precision values (up to 999.9) and prevent overflow on extreme height/weight entries
ALTER TABLE paciente_somatometria ALTER COLUMN imc TYPE NUMERIC(4,1);
