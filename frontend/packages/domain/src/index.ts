export enum UserRole {
  Patient = 'PATIENT',
  Guardian = 'GUARDIAN',
  Medical = 'MEDICAL',
}

export interface User {
  id: string
  name: string
  role: UserRole
}
