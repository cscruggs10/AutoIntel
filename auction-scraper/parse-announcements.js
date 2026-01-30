/**
 * Parse announcement data from AutoNiq browser snapshot
 */

/**
 * Extract announcements from snapshot text
 * Looking for pattern: "Lane:Lot, Grade: X.X ANNOUNCEMENT1; ANNOUNCEMENT2"
 */
export function parseAnnouncements(snapshotText) {
  // Pattern: Grade: 1.0 AS IS; INOP; TMU
  const gradePattern = /Grade:\s*([\d.]+)\s*(.+?)(?:\n|$)/i;
  const match = snapshotText.match(gradePattern);
  
  if (!match) {
    return {
      grade: null,
      announcements: []
    };
  }
  
  const grade = parseFloat(match[1]);
  const announcementText = match[2].trim();
  
  // Split by semicolon or pipe
  const announcements = announcementText
    .split(/[;|]/)
    .map(a => a.trim())
    .filter(Boolean);
  
  return {
    grade,
    announcements
  };
}

/**
 * Extract auction info (name, date, lane/lot)
 */
export function parseAuctionInfo(snapshotText) {
  // Pattern: United Auto Exchange Memphis
  //          Thu, Jan 29 at 12:30PM CST
  //          9:0546, Grade: ...
  
  const lines = snapshotText.split('\n');
  let auctionName = null;
  let laneLot = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Look for lane:lot pattern before "Grade:"
    const laneLotMatch = line.match(/(\d+):(\d+),\s*Grade:/);
    if (laneLotMatch) {
      laneLot = `${laneLotMatch[1]}:${laneLotMatch[2]}`;
      
      // Auction name is usually 2-3 lines before
      if (i >= 2 && lines[i-2].trim()) {
        auctionName = lines[i-2].trim();
      }
    }
  }
  
  return {
    auctionName,
    laneLot
  };
}

/**
 * Parse full vehicle data from snapshot
 */
export function parseVehicleData(snapshot) {
  // Convert snapshot object to text for parsing
  const snapshotText = JSON.stringify(snapshot, null, 2);
  
  const announcements = parseAnnouncements(snapshotText);
  const auctionInfo = parseAuctionInfo(snapshotText);
  
  return {
    ...announcements,
    ...auctionInfo
  };
}
