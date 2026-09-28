export function settingSectionAccess({
  isAdmin = false,
  isSuperadmin = false,
  isPlatformDeveloper = false,
  loyalty = false,
} = {}) {
  return {
    "Client Web Shop": isAdmin === true || isSuperadmin === true,
    "Customer Loyalty": loyalty === true,
    "Server / API Configuration": isSuperadmin === true,
    Platform: isAdmin === true || isSuperadmin === true || isPlatformDeveloper === true,
    "Message Templates": isAdmin === true || isSuperadmin === true,
  }
}

export function sectionIsVisible(access, section) {
  return access?.[section] !== false
}
