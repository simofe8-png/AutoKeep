/**
 * Hebrew UI strings. All user-facing copy lives here so wording (especially uncertainty and
 * provenance language) stays consistent across screens.
 */
export const he = {
  app: { name: 'AutoKeep' },
  common: {
    continue: 'המשך',
    cancel: 'ביטול',
    confirm: 'אישור',
    save: 'שמירה',
    close: 'סגירה',
    back: 'חזרה',
    retry: 'נסה שוב',
    edit: 'עריכה',
    delete: 'מחיקה',
    loading: 'טוען…',
    optional: 'רשות',
    required: 'חובה',
    km: 'ק״מ',
    showMore: 'הצג עוד',
    showLess: 'הצג פחות',
  },
  tabs: {
    home: 'בית',
    maintenance: 'תחזוקה',
    history: 'היסטוריה',
    documents: 'מסמכים',
  },
  header: {
    alerts: 'התראות',
    settings: 'הגדרות ופרופיל',
  },
  verification: {
    verified: 'מאומת',
    pending: 'חסר מידע / ממתין לאימות',
    unableToVerify: 'לא ניתן לאמת',
  },
  forecast: {
    label: 'צפי',
  },
  states: {
    offlineTitle: 'אין חיבור לרשת',
    offlineMessage: 'המידע השמור זמין. פעולות שדורשות רשת ימשיכו אוטומטית כשהחיבור יחזור.',
    genericErrorTitle: 'משהו השתבש',
    emptyDefault: 'אין עדיין פריטים להצגה',
  },
  activeVehicle: {
    switch: 'החלפת רכב',
    activeLabel: 'כלי רכב פעיל',
    targetVehicle: 'רישום עבור',
    noVehicle: 'לא נבחר כלי רכב',
    odometer: 'מד אוץ',
    activeBadge: 'פעיל',
  },
  vehicles: {
    title: 'כלי הרכב שלי',
  },
  vehicleType: {
    car: 'רכב פרטי',
    motorcycle: 'אופנוע',
    scooter: 'קטנוע',
  },
  demo: {
    banner: 'נתוני הדגמה — אינם מידע אמיתי',
  },
} as const;
