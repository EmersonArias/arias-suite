# Regla de arquitectura — Configuración Arias Suite

Esta regla queda establecida para Arias Suite:

- Todo lo que aporte valor operativo, control, automatización o trazabilidad debe poder crecer sin romper la arquitectura.
- La plataforma mantiene como principios estructurales: Multiempresa, Multihotel, Multiusuario, permisos, trazabilidad, configuración por hotel y escalabilidad.
- Las configuraciones operativas deben poder definirse jerárquicamente: Empresa → Hotel → configuración específica, con valores por defecto y excepciones controladas.
- La configuración de cada hotel no debe obligar a duplicar lógica de negocio.
- Las automatizaciones futuras deben poder añadirse a la configuración sin rehacer la arquitectura existente.
- En Mantenimiento/PAM, la configuración de generación y gestión de OT debe ser por hotel y estar gobernada por permisos.

Esta regla complementa las reglas técnicas ya congeladas de Arias Suite y no modifica identificadores técnicos existentes.
