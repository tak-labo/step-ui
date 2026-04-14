export interface AcmeProvisionerClaims {
  minTLSCertDuration?: string
  maxTLSCertDuration?: string
  defaultTLSCertDuration?: string
}

export interface AcmeProvisioner {
  name: string
  type: string
  claims?: AcmeProvisionerClaims
}

export interface AcmeDurationField {
  label: 'default' | 'min' | 'max'
  value: string
}

export function getAcmeDurationFields(provisioner: AcmeProvisioner): AcmeDurationField[] {
  const claims = provisioner.claims
  if (!claims) return []

  const fields: AcmeDurationField[] = [
    { label: 'default', value: claims.defaultTLSCertDuration ?? '' },
    { label: 'min', value: claims.minTLSCertDuration ?? '' },
    { label: 'max', value: claims.maxTLSCertDuration ?? '' },
  ]

  return fields.filter((field): field is AcmeDurationField => field.value !== '')
}
