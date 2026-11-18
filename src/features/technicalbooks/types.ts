export type FieldKind = 'check' | 'yesno' | 'number' | 'text' | 'date'
export type BookField = {
  id: string; label: string; kind: FieldKind; unit?: string; reference?: string; frequency?: string
  source: string; sourceLabel: string; section: string; min?: number; adverse?: string
}
export type BookDefinition = {
  id: string; title: string; code: string; icon: string; workbook: string; sha256: string
  sheet: string; notes: string[]; assetLabel: string; fields: BookField[]
}
export type Answer = { value: string; note: string }
export type Evidence = { name: string; dataUrl: string }
export type BookEntry = {
  id: string; bookId: string; definitionHash: string; template: BookDefinition; hotelId: string; userId: string
  date: string; time: string; asset: string; location: string; technician: string; campaign: string; frequency: string
  answers: Record<string, Answer>; observations: string; evidence: Evidence[]
  status: 'DRAFT' | 'FINAL'; revision: number; supersedes: string | null; correctionReason: string
  pamTicketId?: string
  pamOutcome?: 'COMPLETED' | 'COMPLETED_WITH_ISSUES'
  pamTicketNumber?: string
  pamPlanId?: string
  pamEquipmentId?: string
  serverVersion?: number
  controlIds?: string[]
  createdAt: string; finalizedAt: string | null
}
