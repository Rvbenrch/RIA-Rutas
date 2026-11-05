# Ría de Rutas

Demo de reparto programado de material hospitalario. Coordinación asigna viajes y el chófer prepara la furgoneta, verifica cada caja y registra la recepción simulada en cada parada.

## Demo pública

Abre [Ría de Rutas](https://rvbenrch.github.io/RIA-Rutas/) y elige un perfil. Las cuatro cuentas de chófer y Coordinación son perfiles ficticios sin contraseña en la demo. El estado se guarda en el navegador. Usa **Cambiar perfil** para ver en Coordinación lo que registraste como chófer y **Restablecer demo** para recuperar los cinco viajes originales.

## Aplicación local

Con Node.js 24.14.0 o posterior, ejecuta `npm start` desde la carpeta del proyecto. Abre [la aplicación local](http://127.0.0.1:8782/).

En el primer arranque se crean `runtime/ria-rutas.sqlite` y `runtime/accesos-locales.txt`. Usa los accesos de ese archivo para los cinco perfiles. Las contraseñas se generan en cada instalación y sus verificadores se guardan en SQLite. La base local conserva operaciones y sesiones al reiniciar. El servidor escucha en la interfaz local.

## Recorrido de prueba

| Viaje | Perfil | Qué comprobar |
| --- | --- | --- |
| V01 | Chófer 01 | Revisión, carga, salida, recepción simulada y cierre. |
| V02 | Chófer 02 | La salida requiere verificar las dos cajas. |
| V03 | Chófer 03 | Una caja de otra parada se rechaza en la entrega. |
| V04 | Chófer 04 | Envía F04 a taller, selecciona F05 y revisa el vehículo sustituto. |
| V05 | Chófer 04 | F04 sigue en taller al día siguiente. Registra el regreso y completa una revisión nueva. |

Los códigos de las cajas aparecen junto al hospital. Introduce esos códigos para comprobar la carga y la entrega. Las fechas de jornada son fijas para poder reproducir la demo. La aplicación registra la hora de cada operación y muestra hora peninsular española.

Coordinación puede asignar viajes nuevos, consultar su cronología y descargar comprobantes de viajes que han salido. El HTML incorpora el logo y los estilos. Los códigos se dibujan en formato Code 39 y se introducen manualmente.

Ejecuta `npm test` para comprobar permisos, carga, entrega, taller y cierre. El workflow de Pages ejecuta esas pruebas y publica exclusivamente `public/`.

Los hospitales, matrículas, cajas y usuarios de ejemplo son ficticios. La recepción se simula con una confirmación de la parada.
