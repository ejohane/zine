/**
 * Format date to be more readable (e.g., "Aug 8th, 2025")
 */
export const formatDate = (date: Date | string | null | undefined): string => {
  if (!date) return "No date available";

  const dateObj = date instanceof Date ? date : new Date(date);

  // Check if date is valid
  if (isNaN(dateObj.getTime())) return "Invalid date";

  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  const day = dateObj.getDate();
  const month = months[dateObj.getMonth()];
  const year = dateObj.getFullYear();

  // Add ordinal suffix to day
  const dayWithSuffix = day + getOrdinalSuffix(day);

  return `${month} ${dayWithSuffix}, ${year}`;
};

/**
 * Helper function to get ordinal suffix
 */
const getOrdinalSuffix = (day: number): string => {
  if (day > 3 && day < 21) return "th";
  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
};

/**
 * Format duration to be human readable (e.g., "5 min", "2.5 hours")
 */
export const formatDuration = (seconds: number | null | undefined): string => {
  if (!seconds) return "";
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}${minutes > 0 ? ` ${minutes} min` : ''}`;
  }
  return `${minutes} min`;
}; 