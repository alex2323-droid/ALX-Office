<p align="center">
  <img src="public/assets/aistudio/1794708396591_f43e1352.png" alt="Icono de ALX Office" width="112" />
</p>

# ALX Office

Suite de oficina móvil y aplicación web progresiva (**PWA**) para crear, visualizar y editar documentos **Word (`DOCX`/`DOC`/`TXT`)**, archivos **PDF** y presentaciones **PowerPoint (`PPT`/`PPTX`)** directamente en su propia vista, con la **misma barra de edición de Word** en todos los formatos, soporte sin conexión y compilación de **APK Android** (`com.alx.office`).

## Características principales

- **Barra de edición unificada estilo Word en todos los formatos** (`DOCX`/`DOC`/`TXT`, `PDF` y `PPT`/`PPTX`): barra inferior rápida (`Negrita`, `Cursiva`, `Subrayado`, listas, casillas) y panel **Herramientas** (`Inicio`, `Insertar`, `Ver`, `Revisar`) con estilos, colores, resaltado, tablas, imágenes, enlaces, comentarios y corrector ortográfico en español con menú contextual.
- **Editor de documentos (DOCX / DOC / TXT)** con ajuste móvil o página A4, buscar y reemplazar, contador en vivo, vista de impresión y exportación en `.doc`, `.html` y `.txt`.
- **Visor y editor de PDF en su propia vista** con panel lateral de miniaturas, edición directa de texto con herramientas Word, anotaciones (firma, resaltado, recuadros, tapar texto), organización de páginas y descarga en `.pdf`.
- **Visor y editor de presentaciones (PPT / PPTX)** con edición enriquecida dentro de cada diapositiva, notas del orador, cuadrícula visual y modo presentación a pantalla completa.
- **Almacenamiento local offline y Google Drive** con guardado automático en caché e integración con **Google Picker**.

## Capturas de pantalla

| Inicio y gestor de archivos | Editor de documentos | Visor de presentaciones PPTX |
| :---: | :---: | :---: |
| ![Inicio de ALX Office](public/assets/aistudio/Screenshot_2026-11-14-21-51-43-529_com.android.chrome_70780b2d.png) | ![Editor de documentos ALX Office](public/assets/aistudio/Screenshot_2026-11-14-21-52-43-329_com.android.chrome_3c5e6256.png) | ![Visor PPTX de ALX Office](public/assets/aistudio/Screenshot_2026-11-14-21-52-24-276_com.android.chrome_2b1aa0c5.png) |

## Enlaces directos de los recursos en GitHub

Al subir el repositorio de **`alex2323-droid`** en GitHub (reemplazando `<REPOSITORIO>` por el nombre de tu repositorio), el icono y las tres capturas quedan disponibles en:

- **Icono de la aplicación:** `public/assets/aistudio/1794708396591_f43e1352.png`
  - URL raw: `https://raw.githubusercontent.com/alex2323-droid/<REPOSITORIO>/main/public/assets/aistudio/1794708396591_f43e1352.png`
- **Inicio:** `public/assets/aistudio/Screenshot_2026-11-14-21-51-43-529_com.android.chrome_70780b2d.png`
  - URL raw: `https://raw.githubusercontent.com/alex2323-droid/<REPOSITORIO>/main/public/assets/aistudio/Screenshot_2026-11-14-21-51-43-529_com.android.chrome_70780b2d.png`
- **Editor de documentos:** `public/assets/aistudio/Screenshot_2026-11-14-21-52-43-329_com.android.chrome_3c5e6256.png`
  - URL raw: `https://raw.githubusercontent.com/alex2323-droid/<REPOSITORIO>/main/public/assets/aistudio/Screenshot_2026-11-14-21-52-43-329_com.android.chrome_3c5e6256.png`
- **Visor PPTX:** `public/assets/aistudio/Screenshot_2026-11-14-21-52-24-276_com.android.chrome_2b1aa0c5.png`
  - URL raw: `https://raw.githubusercontent.com/alex2323-droid/<REPOSITORIO>/main/public/assets/aistudio/Screenshot_2026-11-14-21-52-24-276_com.android.chrome_2b1aa0c5.png`

## Paquete y Releases en GitHub

- **Nombre del paquete (`package.json`):** `alx-office` (`v1.0.0`)
- **ID del paquete Android (`applicationId` en `capacitor.config.json`):** `com.alx.office`
- **Archivo APK de Release generado:** `ALX-Office-v1.0.0.apk`
- **Página de Releases:** `https://github.com/alex2323-droid/<REPOSITORIO>/releases/latest`
- **Enlace directo de descarga del APK:**  
  `https://github.com/alex2323-droid/<REPOSITORIO>/releases/download/v1.0.0/ALX-Office-v1.0.0.apk`

El flujo automático [`.github/workflows/release-apk.yml`](.github/workflows/release-apk.yml) se ejecuta **automáticamente en cada push a `main` / `master`** (además de tags `v*` o ejecución manual desde **Actions**), compila el APK firmado y lo publica directamente en la sección **Releases** de GitHub.

## Desarrollo y compilación

```bash
npm install
npm run dev      # Servidor de desarrollo en http://localhost:3000
npm run lint     # Verificación de tipos TypeScript (tsc --noEmit)
npm run build    # Compilación de producción y PWA en dist/
```
