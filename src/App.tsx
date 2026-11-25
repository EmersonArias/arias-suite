import { lazy, Suspense } from 'react'
import SuiteLayout from './shared/navigation/SuiteLayout'
import SuiteAreaPage from './shared/navigation/SuiteAreaPage'
import LegacyRedirect from './shared/navigation/LegacyRedirect'

import { Navigate, Routes, Route, useLocation } from 'react-router-dom'
import { useAuth } from './features/auth/context/AuthProvider'
import { isDemoUser } from './core/access/demoReadOnly'
import BooksPage from './pages/Books/BooksPage'
import LoginPage from './features/auth/pages/LoginPage'
import ActivateAccountPage from './features/auth/pages/ActivateAccountPage'
import ForgotPasswordPage from './features/auth/pages/ForgotPasswordPage'
import UpdatePasswordPage from './features/auth/pages/UpdatePasswordPage'

import ProtectedRoute from './features/auth/components/ProtectedRoute'













































import GlobalEscapeNavigation from './shared/components/navigation/GlobalEscapeNavigation'





const TechnicalBooksRoute = lazy(() => import('./features/technicalbooks/TechnicalBooksRoute'))
const MyProfilePage = lazy(() => import('./features/auth/pages/MyProfilePage'))
const UsersPage = lazy(() => import('./features/users/pages/UsersPage'))
const RolesPage = lazy(() => import('./features/roles/pages/RolesPage'))
const AccessLogPage = lazy(() => import('./features/accesslog/AccessLogPage'))
const ReportsPage = lazy(() => import('./features/reports/pages/ReportsPage'))
const AssetsPage = lazy(() => import('./features/registers/pages/AssetsPage'))
const PumpsPage = lazy(() => import('./features/registers/pages/PumpsPage'))
const PoolsPage = lazy(() => import('./features/pools/pages/PoolsPage'))
const SpaPage = lazy(() => import('./features/spa/pages/SpaPage'))
const LegionellaPage = lazy(() => import('./features/legionella/pages/LegionellaPage'))
const ClimatizersPage = lazy(() => import('./features/climatizers/pages/ClimatizersPage'))
const FancoilsPage = lazy(() => import('./features/fancoils/pages/FancoilsPage'))
const ElectricalPanelsPage = lazy(() => import('./features/electricalpanels/pages/ElectricalPanelsPage'))
const ElectricalPanelDetailPage = lazy(() => import('./features/electricalpanels/pages/ElectricalPanelDetailPage'))
const ElectricalPanelsReportPage = lazy(() => import('./features/electricalpanels/pages/ElectricalPanelsReportPage'))
const PhotoluminescentPage = lazy(() => import('./features/photoluminescent/pages/PhotoluminescentPage'))
const EmergencyLightsPage = lazy(() => import('./features/emergencylights/pages/EmergencyLightsPage'))
const FireDoorsPage = lazy(() => import('./features/firedoors/pages/FireDoorsPage'))
const CalibrationsPage = lazy(() => import('./features/calibrations/pages/CalibrationsPage'))
const FireEquipmentPage = lazy(() => import('./features/fireequipment/pages/FireEquipmentPage'))
const ExtinguishersPage = lazy(() => import('./features/fireequipment/pages/ExtinguishersPage'))
const BiePage = lazy(() => import('./features/fireequipment/pages/BiePage'))
const SprinklersPage = lazy(() => import('./features/fireequipment/pages/SprinklersPage'))
const PciReviewPage = lazy(() => import('./features/fireequipment/pages/PciReviewPage'))
const ApparatusRegistryPage = lazy(() => import('./features/apparatusregistry/pages/ApparatusRegistryPage'))
const ApparatusRegistryDetailPage = lazy(() => import('./features/apparatusregistry/pages/ApparatusRegistryDetailPage'))
const ApparatusRegistryReportPage = lazy(() => import('./features/apparatusregistry/pages/ApparatusRegistryReportPage'))
const MaintenanceConfigurationPage = lazy(() => import('./features/maintenance/pages/MaintenanceConfigurationPage'))
const HotelStructurePage = lazy(() => import('./features/maintenance/pages/HotelStructurePage'))
const MaintenancePamPage = lazy(() => import('./features/maintenance/pages/MaintenancePamPage'))
const MaintenancePamDetailPage = lazy(() => import('./features/maintenance/pages/MaintenancePamDetailPage'))
const MaintenanceRecordsPage = lazy(() => import('./features/maintenance/pages/MaintenanceRecordsPage'))
const MaintenanceRecordPage = lazy(() => import('./features/maintenance/pages/MaintenanceRecordPage'))
const MaintenanceWorkOrdersPage = lazy(() => import('./features/maintenance/pages/MaintenanceWorkOrdersPage'))
const MaintenanceWorkOrderDetailPage = lazy(() => import('./features/maintenance/pages/MaintenanceWorkOrderDetailPage'))
const MaintenanceWorkOrderHistoryPage = lazy(() => import('./features/maintenance/pages/MaintenanceWorkOrderHistoryPage'))
const MaintenanceTicketsReportPage = lazy(() => import('./features/maintenance/pages/MaintenanceTicketsReportPage'))
const MaterialsInventoryPage = lazy(() => import('./features/materials/pages/MaterialsInventoryPage'))
const MaintenanceLandingPage = lazy(() => import('./features/maintenance/pages/MaintenanceLandingPage'))
const MaintenancePlanningPage = lazy(() => import('./features/maintenance/pages/MaintenancePlanningPage'))
const MaintenancePendingPage = lazy(() => import('./features/maintenance/pages/MaintenancePendingPage'))
const MaintenancePendingReportPage = lazy(() => import('./features/maintenance/pages/MaintenancePendingReportPage'))
const RoomProjectsPage = lazy(() => import('./features/maintenance/pages/RoomProjectsPage'))
const RoomFancoilPreventivesPage = lazy(() => import('./features/maintenance/pages/RoomFancoilPreventivesPage'))
const ProvidersPage = lazy(() => import('./features/providers/pages/ProvidersPage'))
const ActionsPage = lazy(() => import('./features/actions/pages/ActionsPage'))
const StaffSchedulePage = lazy(() => import('./features/staff/pages/StaffSchedulePage'))
const StaffSelfServicePage = lazy(() => import('./features/staff/pages/StaffSelfServicePage'))
const StaffClockPage = lazy(() => import('./features/staff/pages/StaffClockPage'))
const StaffClockAdminPage = lazy(() => import('./features/staff/pages/StaffClockAdminPage'))

export default function App() {
const location = useLocation()
const publicPath = ['/login', '/activate', '/forgot-password', '/update-password'].includes(location.pathname)
const {session}=useAuth()
if(isDemoUser(session?.user.id) && !publicPath && location.pathname!=='/planificador-horario')
  return <Navigate to="/planificador-horario" replace />
return (<div className={publicPath ? '' : 'arias-suite-app'}><GlobalEscapeNavigation />
<Suspense fallback={<div role="status" className="p-6 text-center text-slate-500">Cargando módulo…</div>}><Routes>
<Route path="/login" element={<LoginPage />} />
<Route path="/activate" element={<ActivateAccountPage />} />
<Route path="/forgot-password" element={<ForgotPasswordPage />} />
<Route path="/update-password" element={<UpdatePasswordPage />} />
<Route path="/mi-horario" element={<StaffSelfServicePage />} />
<Route path="/fichaje" element={<StaffClockPage />} />
<Route element={<ProtectedRoute />}>
<Route element={<SuiteLayout />}><Route path="/" element={<BooksPage />} />
<Route path="/users" element={<UsersPage />} />
<Route path="/roles" element={<RolesPage />} />
<Route path="/admin/accesos" element={<AccessLogPage />} />
<Route path="/profile" element={<MyProfilePage />} />
<Route path="/reports" element={<ReportsPage />} />
<Route path="/pam" element={<LegacyRedirect to="/maintenance/pam" />} />
<Route path="/planning" element={<Navigate to="/maintenance/pam" replace />} />
<Route path="/providers" element={<ProvidersPage />} />
<Route path="/actions" element={<Navigate to="/maintenance/interventions" replace />} />
<Route path="/assets" element={<AssetsPage />} />
<Route path="/registros-tecnicos/anteriores/pumps" element={<PumpsPage />} />
<Route path="/pumps" element={<LegacyRedirect to="/registros-tecnicos/libros/bombas" />} />
<Route path="/pools" element={<PoolsPage />} />
<Route path="/spa" element={<SpaPage />} />
<Route path="/registros-tecnicos/anteriores/legionella" element={<LegionellaPage />} />
<Route path="/registros-tecnicos/campanas" element={<TechnicalBooksRoute mode="campaigns" />} />
<Route path="/registros-tecnicos/catalogo/:bookId" element={<TechnicalBooksRoute mode="catalog" />} />
<Route path="/legionella" element={<LegacyRedirect to="/registros-tecnicos/libros/legionella" />} />
<Route path="/registros-tecnicos/anteriores/climatizers" element={<ClimatizersPage />} />
<Route path="/climatizers" element={<LegacyRedirect to="/registros-tecnicos/libros/climatizadores" />} />
<Route path="/registros-tecnicos/anteriores/fancoils" element={<FancoilsPage />} />
<Route path="/fancoils" element={<LegacyRedirect to="/registros-tecnicos/libros/fancoils" />} />
<Route path="/electricalpanels" element={<ElectricalPanelsPage />} />
<Route path="/electricalpanels/new" element={<ElectricalPanelDetailPage />} />
<Route path="/electricalpanels/report" element={<ElectricalPanelsReportPage />} />
<Route path="/electricalpanels/:id" element={<ElectricalPanelDetailPage />} />
<Route path="/apparatusregistry" element={<ApparatusRegistryPage />} />
<Route path="/maintenance" element={<MaintenanceLandingPage />} />
<Route path="/maintenance/preventivos" element={<SuiteAreaPage hub="preventives" />} />
<Route path="/maintenance/proyectos" element={<SuiteAreaPage hub="projects" />} />
<Route path="/maintenance/trabajos" element={<SuiteAreaPage hub="work" />} />
<Route path="/personal" element={<SuiteAreaPage hub="people" />} />
<Route path="/documentacion" element={<SuiteAreaPage hub="documents" />} />
<Route path="/planificador-horario" element={<StaffSchedulePage />} />
<Route path="/registro-jornada" element={<StaffClockAdminPage />} />
<Route path="/materials" element={<MaterialsInventoryPage />} />
<Route path="/maintenance/pam" element={<MaintenancePamPage />} />
<Route path="/maintenance/interventions" element={<ActionsPage />} />
<Route path="/maintenance/pam/:apparatusId" element={<MaintenancePamDetailPage />} />
<Route path="/registros-tecnicos" element={<MaintenanceRecordsPage />} />
<Route path="/registros-tecnicos/anteriores" element={<MaintenanceRecordsPage />} />
<Route path="/registros-tecnicos/libros" element={<TechnicalBooksRoute />} />
<Route path="/registros-tecnicos/libros/:bookId" element={<TechnicalBooksRoute />} />
<Route path="/registros-tecnicos/pruebas" element={<TechnicalBooksRoute />} />
<Route path="/registros-tecnicos/pruebas/:bookId" element={<TechnicalBooksRoute />} />
<Route path="/maintenance/audit/records" element={<Navigate to="/registros-tecnicos" replace />} />
<Route path="/maintenance/records" element={<Navigate to="/registros-tecnicos" replace />} />
<Route path="/maintenance/record" element={<MaintenanceRecordPage />} />
<Route path="/maintenance/operation" element={<Navigate to="/maintenance" replace />} />
<Route path="/maintenance/tickets" element={<MaintenanceWorkOrdersPage />} />
<Route path="/maintenance/planning" element={<MaintenancePlanningPage />} />
<Route path="/maintenance/pending" element={<MaintenancePendingPage />} />
<Route path="/maintenance/pending/report" element={<MaintenancePendingReportPage />} />
<Route path="/maintenance/room-projects" element={<LegacyRedirect to="/maintenance/proyectos/led-armario" />} />
<Route path="/maintenance/proyectos/led-armario" element={<RoomProjectsPage />} />
<Route path="/maintenance/fancoil-preventives" element={<LegacyRedirect to="/maintenance/preventivos/fancoils" />} />
<Route path="/maintenance/preventivos/fancoils" element={<RoomFancoilPreventivesPage />} />
<Route path="/maintenance/work-orders" element={<Navigate to="/maintenance/tickets" replace />} />
<Route path="/maintenance/tickets/:workOrderId" element={<MaintenanceWorkOrderDetailPage />} />
<Route path="/maintenance/work-orders/:workOrderId" element={<MaintenanceWorkOrderDetailPage />} />
<Route path="/maintenance/tickets/history" element={<MaintenanceWorkOrderHistoryPage />} />
<Route path="/maintenance/tickets/report" element={<MaintenanceTicketsReportPage />} />
<Route path="/maintenance/history" element={<Navigate to="/maintenance/tickets/history" replace />} />
<Route path="/maintenance/plans" element={<Navigate to="/maintenance/pam" replace />} />
<Route path="/maintenance/configuration" element={<MaintenanceConfigurationPage />} />
<Route path="/maintenance/structure" element={<HotelStructurePage />} />
<Route path="/maintenance/audit" element={<LegacyRedirect to="/documentacion" />} />
<Route path="/apparatusregistry/new" element={<ApparatusRegistryDetailPage />} />
<Route path="/apparatusregistry/report" element={<ApparatusRegistryReportPage />} />
<Route path="/apparatusregistry/:id" element={<ApparatusRegistryDetailPage />} />
<Route path="/registros-tecnicos/anteriores/photoluminescent" element={<PhotoluminescentPage />} />
<Route path="/photoluminescent" element={<LegacyRedirect to="/registros-tecnicos/libros/fotoluminiscentes" />} />
<Route path="/registros-tecnicos/anteriores/emergencylights" element={<EmergencyLightsPage />} />
<Route path="/emergencylights" element={<LegacyRedirect to="/registros-tecnicos/libros/luces-emergencia" />} />
<Route path="/registros-tecnicos/anteriores/firedoors" element={<FireDoorsPage />} />
<Route path="/firedoors" element={<LegacyRedirect to="/registros-tecnicos/libros/puertas-cortafuegos" />} />
<Route path="/registros-tecnicos/anteriores/calibrations" element={<CalibrationsPage />} />
<Route path="/calibrations" element={<LegacyRedirect to="/registros-tecnicos/libros/calibraciones" />} />
<Route path="/fireequipment" element={<FireEquipmentPage />} />
<Route path="/registros-tecnicos/anteriores/fireequipment/extinguishers" element={<ExtinguishersPage />} />
<Route path="/fireequipment/extinguishers" element={<LegacyRedirect to="/registros-tecnicos/libros/extintores" />} />
<Route path="/registros-tecnicos/anteriores/fireequipment/bie" element={<BiePage />} />
<Route path="/fireequipment/bie" element={<LegacyRedirect to="/registros-tecnicos/libros/bie" />} />
<Route path="/registros-tecnicos/anteriores/fireequipment/sprinklers" element={<SprinklersPage />} />
<Route path="/fireequipment/sprinklers" element={<LegacyRedirect to="/registros-tecnicos/libros/rociadores" />} />
<Route path="/registros-tecnicos/anteriores/fireequipment/pci-review" element={<PciReviewPage />} />
<Route path="/fireequipment/pci-review" element={<LegacyRedirect to="/registros-tecnicos/libros/pci" />} /></Route>
</Route>
</Routes></Suspense>
</div>
)
}
