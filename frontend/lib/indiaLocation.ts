export type StateOption = {
  name: string;
  code: string;
  suggestedCities: string[];
};

export const INDIA_STATES: StateOption[] = [
  { name: 'Andhra Pradesh', code: 'AP', suggestedCities: ['Visakhapatnam', 'Vijayawada', 'Guntur', 'Tirupati', 'Kurnool'] },
  { name: 'Arunachal Pradesh', code: 'AR', suggestedCities: ['Itanagar', 'Naharlagun', 'Pasighat', 'Tawang', 'Ziro'] },
  { name: 'Assam', code: 'AS', suggestedCities: ['Guwahati', 'Silchar', 'Dibrugarh', 'Jorhat', 'Tezpur'] },
  { name: 'Bihar', code: 'BR', suggestedCities: ['Patna', 'Gaya', 'Bhagalpur', 'Muzaffarpur', 'Purnia'] },
  { name: 'Chhattisgarh', code: 'CG', suggestedCities: ['Raipur', 'Bhilai', 'Bilaspur', 'Korba', 'Durg'] },
  { name: 'Goa', code: 'GA', suggestedCities: ['Panaji', 'Margao', 'Mapusa', 'Vasco da Gama', 'Ponda'] },
  { name: 'Gujarat', code: 'GJ', suggestedCities: ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Bhavnagar'] },
  { name: 'Haryana', code: 'HR', suggestedCities: ['Gurugram', 'Faridabad', 'Panipat', 'Ambala', 'Hisar'] },
  { name: 'Himachal Pradesh', code: 'HP', suggestedCities: ['Shimla', 'Dharamshala', 'Solan', 'Mandi', 'Kullu'] },
  { name: 'Jharkhand', code: 'JH', suggestedCities: ['Ranchi', 'Jamshedpur', 'Dhanbad', 'Bokaro', 'Hazaribagh'] },
  { name: 'Karnataka', code: 'KA', suggestedCities: ['Bengaluru', 'Mysuru', 'Mangaluru', 'Hubballi', 'Belagavi'] },
  { name: 'Kerala', code: 'KL', suggestedCities: ['Thiruvananthapuram', 'Kochi', 'Kozhikode', 'Thrissur', 'Kollam'] },
  { name: 'Madhya Pradesh', code: 'MP', suggestedCities: ['Bhopal', 'Indore', 'Gwalior', 'Jabalpur', 'Ujjain'] },
  { name: 'Maharashtra', code: 'MH', suggestedCities: ['Mumbai', 'Pune', 'Nagpur', 'Nashik', 'Aurangabad'] },
  { name: 'Manipur', code: 'MN', suggestedCities: ['Imphal', 'Thoubal', 'Bishnupur', 'Churachandpur', 'Ukhrul'] },
  { name: 'Meghalaya', code: 'ML', suggestedCities: ['Shillong', 'Tura', 'Jowai', 'Nongstoin', 'Baghmara'] },
  { name: 'Mizoram', code: 'MZ', suggestedCities: ['Aizawl', 'Lunglei', 'Champhai', 'Kolasib', 'Serchhip'] },
  { name: 'Nagaland', code: 'NL', suggestedCities: ['Kohima', 'Dimapur', 'Mokokchung', 'Tuensang', 'Wokha'] },
  { name: 'Odisha', code: 'OD', suggestedCities: ['Bhubaneswar', 'Cuttack', 'Rourkela', 'Sambalpur', 'Puri'] },
  { name: 'Punjab', code: 'PB', suggestedCities: ['Ludhiana', 'Amritsar', 'Jalandhar', 'Patiala', 'Bathinda'] },
  { name: 'Rajasthan', code: 'RJ', suggestedCities: ['Jaipur', 'Jodhpur', 'Kota', 'Udaipur', 'Ajmer'] },
  { name: 'Sikkim', code: 'SK', suggestedCities: ['Gangtok', 'Namchi', 'Mangan', 'Gyalshing', 'Rangpo'] },
  { name: 'Tamil Nadu', code: 'TN', suggestedCities: ['Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem'] },
  { name: 'Telangana', code: 'TG', suggestedCities: ['Hyderabad', 'Warangal', 'Nizamabad', 'Karimnagar', 'Khammam'] },
  { name: 'Tripura', code: 'TR', suggestedCities: ['Agartala', 'Udaipur', 'Dharmanagar', 'Kailashahar', 'Belonia'] },
  { name: 'Uttar Pradesh', code: 'UP', suggestedCities: ['Lucknow', 'Kanpur', 'Noida', 'Varanasi', 'Agra'] },
  { name: 'Uttarakhand', code: 'UK', suggestedCities: ['Dehradun', 'Haridwar', 'Haldwani', 'Roorkee', 'Rudrapur'] },
  { name: 'West Bengal', code: 'WB', suggestedCities: ['Kolkata', 'Howrah', 'Durgapur', 'Siliguri', 'Asansol'] }
];

function sanitizeSegment(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .replace(/\s+/g, '_');
}

export function buildJurisdictionCode(stateCode: string, cityOrDistrict: string): string {
  return `IN-${sanitizeSegment(stateCode)}-${sanitizeSegment(cityOrDistrict)}`;
}
