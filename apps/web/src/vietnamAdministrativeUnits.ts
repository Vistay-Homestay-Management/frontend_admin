export type VietnamAdministrativeUnit = {
  code: string
  name: string
  type: 'CITY' | 'PROVINCE'
}

// Decision 19/2025/QD-TTg: the 34 province-level administrative units
// used nationally from 1 July 2025.
export const VIETNAM_ADMINISTRATIVE_UNITS: readonly VietnamAdministrativeUnit[] = [
  { code: '01', name: 'Hà Nội', type: 'CITY' },
  { code: '04', name: 'Cao Bằng', type: 'PROVINCE' },
  { code: '08', name: 'Tuyên Quang', type: 'PROVINCE' },
  { code: '11', name: 'Điện Biên', type: 'PROVINCE' },
  { code: '12', name: 'Lai Châu', type: 'PROVINCE' },
  { code: '14', name: 'Sơn La', type: 'PROVINCE' },
  { code: '15', name: 'Lào Cai', type: 'PROVINCE' },
  { code: '19', name: 'Thái Nguyên', type: 'PROVINCE' },
  { code: '20', name: 'Lạng Sơn', type: 'PROVINCE' },
  { code: '22', name: 'Quảng Ninh', type: 'PROVINCE' },
  { code: '24', name: 'Bắc Ninh', type: 'PROVINCE' },
  { code: '25', name: 'Phú Thọ', type: 'PROVINCE' },
  { code: '31', name: 'Hải Phòng', type: 'CITY' },
  { code: '33', name: 'Hưng Yên', type: 'PROVINCE' },
  { code: '37', name: 'Ninh Bình', type: 'PROVINCE' },
  { code: '38', name: 'Thanh Hóa', type: 'PROVINCE' },
  { code: '40', name: 'Nghệ An', type: 'PROVINCE' },
  { code: '42', name: 'Hà Tĩnh', type: 'PROVINCE' },
  { code: '44', name: 'Quảng Trị', type: 'PROVINCE' },
  { code: '46', name: 'Huế', type: 'CITY' },
  { code: '48', name: 'Đà Nẵng', type: 'CITY' },
  { code: '51', name: 'Quảng Ngãi', type: 'PROVINCE' },
  { code: '52', name: 'Gia Lai', type: 'PROVINCE' },
  { code: '56', name: 'Khánh Hòa', type: 'PROVINCE' },
  { code: '66', name: 'Đắk Lắk', type: 'PROVINCE' },
  { code: '68', name: 'Lâm Đồng', type: 'PROVINCE' },
  { code: '75', name: 'Đồng Nai', type: 'PROVINCE' },
  { code: '79', name: 'Hồ Chí Minh', type: 'CITY' },
  { code: '80', name: 'Tây Ninh', type: 'PROVINCE' },
  { code: '82', name: 'Đồng Tháp', type: 'PROVINCE' },
  { code: '86', name: 'Vĩnh Long', type: 'PROVINCE' },
  { code: '91', name: 'An Giang', type: 'PROVINCE' },
  { code: '92', name: 'Cần Thơ', type: 'CITY' },
  { code: '96', name: 'Cà Mau', type: 'PROVINCE' },
]
