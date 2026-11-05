# Ría de Rutas

Demo de reparto programado de material hospitalario. Coordinación asigna viajes y el chófer prepara la furgoneta, verifica cada caja y registra la recepción simulada en cada parada.

## Demo pública

Abre [Ría de Rutas](https://rvbenrch.github.io/RIA-Rutas/) y despliega **Credenciales públicas de demostración**. Usa `chofer-01` a `chofer-04` o `coordinacion`, con la contraseña pública `RutasDemo26`. La demo verifica esos datos en el navegador y conserva allí las operaciones. Cierra sesión e inicia con Coordinación para ver lo que registraste como chófer. **Restablecer demo** recupera los cinco viajes originales.

## Aplicación local

Con Node.js 24.14.0 o posterior, ejecuta `npm start` desde la carpeta del proyecto. Abre [la aplicación local](http://127.0.0.1:8782/).

En el primer arranque se crean `runtime/ria-rutas.sqlite` y `runtime/accesos-locales.txt`. Usa los accesos de ese archivo para los cinco perfiles. Las contraseñas se generan en cada instalación y sus verificadores se guardan en SQLite. La base local conserva operaciones y sesiones al reiniciar. El servidor escucha en la interfaz local.

## Recorrido de prueba

| Viaje | Perfil | Qué comprobar |
| --- | --- | --- |
| V01 | Lucía Ortega Molina | Revisión, carga, salida, recepción simulada y cierre. |
| V02 | Álvaro Ruiz Medina | La salida requiere verificar las dos cajas. |
| V03 | Nuria Campos León | Una caja de otra parada se rechaza en la entrega. |
| V04 | Mateo Vargas Serrano | Envía F04 a taller, selecciona F05 y revisa el vehículo sustituto. |
| V05 | Mateo Vargas Serrano | F04 sigue en taller al día siguiente. Registra el regreso y completa una revisión nueva. |

Los códigos de las cajas aparecen junto al hospital. Introduce esos códigos para comprobar la carga y la entrega. Las fechas de jornada son fijas para poder reproducir la demo. La aplicación registra la hora de cada operación y muestra hora peninsular española.

Coordinación puede asignar viajes nuevos, consultar su cronología y descargar comprobantes de viajes que han salido. El HTML incorpora el logo y los estilos. Los códigos se dibujan en formato Code 39 y se introducen manualmente.

Ejecuta `npm test` para comprobar permisos, carga, entrega, taller y cierre. El workflow de Pages ejecuta esas pruebas y publica exclusivamente `public/`.

SQLite aplica `UNIQUE (user_id, day, vehicle_id)`. La revisión válida de esa combinación se conserva cuando se repite el mismo envío. Se permite corregir una revisión bloqueante o realizar una revisión tras taller, guardando ambas declaraciones en el historial de la misma fila. Las operaciones locales se ejecutan dentro de una transacción `BEGIN IMMEDIATE`.

Las rutas y las recepciones son ficticias. Los nombres de los hospitales corresponden a centros de Málaga. Los usuarios, matrículas y cajas son datos de demostración.
