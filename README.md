# NWSC Quotation & Certificate Generator

A comprehensive web application for generating water analysis certificates and service quotations for Nkana Water and Sewerage Company.

## Features

- **Certificate Generation**: Create detailed water analysis certificates with regulatory compliance
- **Quotation System**: Generate service quotations with tax calculations (16% VAT)
- **PDF Export**: Download certificates and quotations as PDF with company branding
- **PDF Preview**: Preview documents before downloading
- **Data Management**: Save, load, and manage certificates and quotations locally
- **Standards Library**: Import, export, and maintain local ZABS and ZEMA regulatory references
- **Offline Capable**: Works completely offline once loaded

## Run Locally (Development)

**Prerequisites:** Node.js (v16 or higher)

1. Clone the repository:
   ```bash
   git clone https://github.com/zond-crypto/nwsc-certificates.git
   cd nwsc-certificates
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

4. Open http://localhost:3000 in your browser

## Offline Usage

The application can run completely offline after initial setup:

### Option 1: Development Server (Requires Node.js)
```bash
npm install
npm run dev
```
Access at http://localhost:3000

### Option 2: Production Build (Static Files)
```bash
npm run build
npx serve dist
```
Access at http://localhost:3000

### Option 3: Flask App Server
```bash
npm run build
python app.py
```
Access at http://localhost:5000

### Option 4: Simple Python Server
```bash
npm run build
cd dist
python -m http.server 3000
```
Access at http://localhost:3000

## Data Storage

- All certificates and quotations are stored locally in your browser's localStorage
- No data is sent to external servers
- Imported standards can be exported and versioned as JSON files

## Technologies Used

- React 19 + TypeScript
- Vite (build tool)
- Tailwind CSS (styling)
- jsPDF (PDF generation)
- Shadcn/ui (components)
