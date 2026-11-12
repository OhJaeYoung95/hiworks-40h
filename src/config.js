// 회사 근무 규칙. 규칙이 바뀌면 이 파일만 고치면 된다.
(function (root) {
  const config = {
    weeklyHours: 40, // 주 근무시간
    lunchStart: '13:00', // 점심시간 (근무시간에서 제외)
    lunchEnd: '14:00',
    fridayEarliestLeave: '17:00', // 금요일에 40시간을 채웠을 때 가장 빠른 퇴근 시각
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = config;
  else root.HW40_CONFIG = config;
})(typeof globalThis !== 'undefined' ? globalThis : this);
