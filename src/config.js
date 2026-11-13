// 회사 근무 규칙. 규칙이 바뀌면 이 파일만 고치면 된다.
(function (root) {
  const config = {
    weeklyHours: 40, // 주 근무시간
    workStart: '09:00', // 근무 인정 시작. 이보다 일찍 출근해도 이 시각부터 센다
    lunchStart: '13:00', // 점심시간 (근무시간에서 제외)
    lunchEnd: '14:00',
    fridayEarliestLeave: '17:00', // 금요일에 40시간을 채웠을 때 가장 빠른 퇴근 시각
    // 월~목에 보여주는 "금요일 예상 퇴근"의 가정
    plannedDailyHours: 8, // 목요일까지 남은 날 하루에 일한다고 보는 시간
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = config;
  else root.HW40_CONFIG = config;
})(typeof globalThis !== 'undefined' ? globalThis : this);
