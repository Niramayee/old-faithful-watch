/* Content and prediction constants. Edit freely: facts are plain objects {c: category, t: text}.
   Facts are compiled from National Park Service material and other public sources; corrections welcome. */
window.OF = window.OF || {};

OF.PREDICTION = {
  // Live source: our Vercel function (api/prediction.js), which reads GeyserTimes server-side.
  // GeyserTimes relays the NPS ranger prediction ("Prediction uploaded from NPS/CartoDB system").
  proxyUrl: '/api/prediction',
  refreshMs: 5 * 60 * 1000,
  // Snapshot used when the live source can't be reached. Unix seconds.
  snapshot: {
    fetchedAt: 1790529653,      // Sep 27 2026, 11:20 AM MDT
    lastEruption: 1790528460,   // reported eruption, 11:01 AM MDT
    prediction: 1790535000,     // NPS prediction, 12:50 PM MDT
    windowOpen: 1790534280,
    windowClose: 1790535720
  },
  // Used to project forward from the snapshot when nothing fresher is available.
  averageIntervalMin: 92,
  estimateWindowMin: 15
};

OF.ERUPTION_FACTS = [
  'Water at the vent: about 204°F (95.6°C)',
  'Column height: 106 to 185 feet (32 to 56 m)',
  'Water thrown out: 3,700 to 8,400 gallons',
  'Eruptions last 1½ to 5 minutes'
];

OF.FACTS = [
  // The geyser
  { c: 'The geyser', t: 'Old Faithful was named in 1870 by the Washburn Expedition, whose members were struck by how regularly it erupted.' },
  { c: 'The geyser', t: 'An eruption lasts 1½ to 5 minutes and sends water 106 to 185 feet (32 to 56 m) into the air.' },
  { c: 'The geyser', t: 'A single eruption throws out 3,700 to 8,400 gallons (14,000 to 32,000 liters) of boiling water.' },
  { c: 'The geyser', t: 'Water at the vent has been measured at 204°F (95.6°C), hotter than the local boiling point of about 199°F.' },
  { c: 'The geyser', t: 'Rangers predict the next eruption from the length of the last one. A short eruption means a shorter wait; a long one means a longer wait.' },
  { c: 'The geyser', t: 'Ranger predictions are usually right to within about 10 minutes, roughly 90% of the time.' },
  { c: 'The geyser', t: 'Old Faithful is a cone geyser. Its mound is geyserite, a form of silica that settles out of the hot water very slowly.' },
  { c: 'The geyser', t: 'Old Faithful isn’t the tallest geyser in the park. Steamboat Geyser at Norris can shoot water more than 300 feet high.' },
  { c: 'The geyser', t: 'The small splashes before an eruption have a name. Geyser watchers call them preplay.' },
  { c: 'The geyser', t: 'Earthquakes change Old Faithful’s rhythm. After the 1959 Hebgen Lake earthquake, the average wait between eruptions grew longer.' },
  { c: 'The geyser', t: 'In the park’s early days, visitors dropped laundry into Old Faithful. The next eruption tossed it back out, washed.' },
  { c: 'The geyser', t: 'Old Faithful erupts about 15 to 17 times a day, year-round, whether or not anyone is watching.' },
  { c: 'The geyser', t: 'Old Faithful erupts less often than it used to. The average wait has grown from about an hour in the early 1900s to roughly 90 minutes today.' },

  // Geology
  { c: 'Geology', t: 'Yellowstone sits over a volcanic hotspot. Its last caldera-forming eruption, about 631,000 years ago, created the Yellowstone Caldera.' },
  { c: 'Geology', t: 'The Yellowstone Caldera is roughly 30 by 45 miles (48 by 72 km). Old Faithful sits inside it.' },
  { c: 'Geology', t: 'A geyser needs three things: heat, water, and narrow underground plumbing that traps the water until it flashes to steam.' },
  { c: 'Geology', t: 'Yellowstone has more than 10,000 hydrothermal features, including more than 500 geysers. That is about half of all the geysers on Earth.' },
  { c: 'Geology', t: 'The Upper Geyser Basin, home of Old Faithful, has the largest concentration of geysers in the world.' },
  { c: 'Geology', t: 'The orange and brown streaks in the runoff are mats of heat-loving microbes. Each color thrives at a different temperature.' },
  { c: 'Geology', t: 'Thermus aquaticus, a microbe found in a Yellowstone hot spring in 1966, supplied the enzyme that made PCR, the basis of modern DNA testing, practical.' },
  { c: 'Geology', t: 'The ground here breathes. Parts of the caldera floor rise and sink by a few inches over a year or two.' },
  { c: 'Geology', t: 'The silica that builds Old Faithful’s cone comes from rhyolite, a volcanic rock the hot water dissolves on its way up.' },

  // Ecosystem
  { c: 'Ecosystem', t: 'Lodgepole pines make up about 80% of Yellowstone’s forests.' },
  { c: 'Ecosystem', t: 'Many lodgepole cones stay sealed with resin until the heat of a fire opens them, so new seedlings sprout after a burn.' },
  { c: 'Ecosystem', t: 'The fires of 1988 burned about 36% of the park. On September 7 the North Fork Fire reached Old Faithful, and firefighters saved the Inn.' },
  { c: 'Ecosystem', t: 'In winter, bison and elk gather in geyser basins, where warm ground melts the snow and uncovers grass.' },
  { c: 'Ecosystem', t: 'The Firehole River runs past the Upper Geyser Basin. Hot springs along its banks warm the water.' },
  { c: 'Ecosystem', t: 'Standing dead trees, called snags, are homes for cavity-nesting birds like mountain bluebirds and woodpeckers.' },

  // Wildlife
  { c: 'Wildlife', t: 'Yellowstone is the only place in the United States where bison have lived continuously since prehistoric times.' },
  { c: 'Wildlife', t: 'Bison are North America’s largest land mammal. A bull can weigh 2,000 pounds and still run 35 miles per hour.' },
  { c: 'Wildlife', t: 'In winter, bison swing their huge heads side to side to sweep away snow and reach the grass underneath.' },
  { c: 'Wildlife', t: 'Bison injure more people in Yellowstone than any other animal. Stay at least 25 yards (23 m) from bison and elk.' },
  { c: 'Wildlife', t: 'Bison roll in the dirt to shed winter fur and fend off biting insects. The bare patches they leave are called wallows.' },
  { c: 'Wildlife', t: 'Ravens near Old Faithful have learned to unzip backpacks and open bags. Keep your snacks closed.' },
  { c: 'Wildlife', t: 'Ravens often follow wolves to share in their kills, and they can imitate other animals’ calls.' },
  { c: 'Wildlife', t: 'Gray wolves returned to Yellowstone in 1995, about 70 years after the last packs were killed.' },
  { c: 'Wildlife', t: 'Elk are the most numerous large mammal in Yellowstone. In fall, bull elk bugle to attract mates.' },
  { c: 'Wildlife', t: 'Grizzly and black bears both live in the park. Stay at least 100 yards (91 m) from bears and wolves.' },
  { c: 'Wildlife', t: 'Bald eagles and ospreys hunt fish along Yellowstone’s rivers and lakes.' },

  // History
  { c: 'History', t: 'Yellowstone became the world’s first national park on March 1, 1872, when President Ulysses S. Grant signed it into law.' },
  { c: 'History', t: 'People have lived in and traveled through Yellowstone for more than 11,000 years. Today 27 tribes have historic ties to the park.' },
  { c: 'History', t: 'Obsidian from Yellowstone’s Obsidian Cliff has turned up at ancient sites as far away as Ohio.' },
  { c: 'History', t: 'The name Yellowstone comes from the Hidatsa name for the Yellowstone River, which French trappers translated as Roche Jaune.' },
  { c: 'History', t: 'Thomas Moran’s paintings and William Henry Jackson’s photographs from the 1871 Hayden survey helped persuade Congress to protect the park.' },
  { c: 'History', t: 'The US Army managed Yellowstone from 1886 to 1918, until the new National Park Service took over.' },

  // The Inn & Lodge
  { c: 'The Inn & Lodge', t: 'The Old Faithful Inn opened in 1904. Architect Robert Reamer built it from local lodgepole pine and rhyolite stone.' },
  { c: 'The Inn & Lodge', t: 'The Inn’s lobby rises about 76 feet, around a stone fireplace made from roughly 500 tons of rhyolite.' },
  { c: 'The Inn & Lodge', t: 'High in the Inn’s lobby is the Crow’s Nest, a platform where musicians once played. It has been closed to guests since the 1959 earthquake.' },
  { c: 'The Inn & Lodge', t: 'The Old Faithful Inn is one of the largest log buildings in the world and a National Historic Landmark.' },
  { c: 'The Inn & Lodge', t: 'The Old Faithful Lodge, completed in the 1920s, has tall windows that look straight out at the geyser.' },
  { c: 'The Inn & Lodge', t: 'The Old Faithful Visitor Education Center opened in 2010. Its exhibits explain how geysers work.' },
  { c: 'The Inn & Lodge', t: 'The Old Faithful Snow Lodge opened in 1999 and is one of only two park lodges open in winter.' },

  // The park
  { c: 'The park', t: 'Yellowstone covers about 2.2 million acres, mostly in Wyoming, with slivers in Montana and Idaho.' },
  { c: 'The park', t: 'Yellowstone Lake is the largest lake above 7,000 feet in North America.' },
  { c: 'The park', t: 'Isa Lake, at Craig Pass east of Old Faithful, sits on the Continental Divide and drains to both the Atlantic and the Pacific.' },
  { c: 'The park', t: 'The Lower Falls in the Grand Canyon of the Yellowstone drop 308 feet, nearly twice as far as Niagara Falls.' },
  { c: 'The park', t: 'Yellowstone gets more than 4 million visits a year.' },
  { c: 'The park', t: 'In winter, the only ways to reach Old Faithful are by snowcoach, snowmobile, or on skis.' },
  { c: 'The park', t: 'Old Faithful sits at about 7,300 feet (2,230 m) above sea level.' }
];
