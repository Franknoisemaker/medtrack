-- Migration: 20260525000010_notas_soap_unique_constraint.sql
-- Description: Add UNIQUE constraint on notas_soap(consulta_id) to support
--              upsert operations (ON CONFLICT) from the autosave SOAP draft RPC
--              and the REST fallback in useAutosaveSoap.
--
-- Note: One consultation = one SOAP note (draft or signed). Multiple revisions
-- are handled via soap_aclaraciones, not by inserting multiple notas_soap rows.

ALTER TABLE notas_soap
  ADD CONSTRAINT notas_soap_consulta_id_unique UNIQUE (consulta_id);
