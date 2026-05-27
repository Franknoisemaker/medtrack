-- Migration: 20260522000001_inmutabilidad.sql
-- Description: Implement PL/pgSQL trigger to enforce legal immutability under NOM-004

CREATE OR REPLACE FUNCTION check_inmutabilidad_soap_fn()
RETURNS TRIGGER AS $$
BEGIN
    -- Block modifications if the SOAP note is already signed
    IF (OLD.status = 'signed') THEN
        RAISE EXCEPTION 'Las notas firmadas son inmutables bajo NOM-004. No se permiten actualizaciones o eliminaciones.';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bind trigger to run BEFORE UPDATE or DELETE on notas_soap
CREATE TRIGGER check_inmutabilidad_soap
BEFORE UPDATE OR DELETE ON notas_soap
FOR EACH ROW
EXECUTE FUNCTION check_inmutabilidad_soap_fn();
