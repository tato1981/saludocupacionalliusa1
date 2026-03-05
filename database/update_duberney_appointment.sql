-- 1. PRIMERO: Verificar la cita actual antes de actualizar
-- Esto te mostrará la fecha actual para confirmar que estás modificando el registro correcto
SELECT 
    a.id AS appointment_id, 
    p.name AS patient_name, 
    p.document_number,
    a.appointment_date AS fecha_actual_cita, 
    a.status 
FROM appointments a
JOIN patients p ON a.patient_id = p.id
WHERE p.name LIKE '%Duberney Obando%'
AND a.status = 'programada';

-- 2. SEGUNDO: Actualizar la fecha de la cita
-- IMPORTANTE: Fecha actualizada al 30 de Noviembre de 2025 a las 8:30 AM
UPDATE appointments a
JOIN patients p ON a.patient_id = p.id
SET a.appointment_date = '2025-11-30 08:30:00' 
WHERE p.name LIKE '%Duberney Obando%'
AND a.status = 'programada';

-- 3. TERCERO: Verificar que el cambio se haya realizado correctamente
SELECT 
    a.id AS appointment_id, 
    p.name AS patient_name, 
    a.appointment_date AS new_date, 
    a.status 
FROM appointments a
JOIN patients p ON a.patient_id = p.id
WHERE p.name LIKE '%Duberney Obando%'
AND a.status = 'programada';
