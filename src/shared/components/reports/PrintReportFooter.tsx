export default function PrintReportFooter() {
  return (
    <div className="arias-report-footer" aria-label="Responsable del informe">
      <div className="arias-report-footer-line" aria-hidden="true" />
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        <span>Arias Suite</span>
        <span>
          Responsable SSTT hotel SB Diagonal Zero - Emerson Arias
        </span>
        <span>{new Date().toLocaleDateString('es-ES')}</span>
      </div>
    </div>
  )
}
