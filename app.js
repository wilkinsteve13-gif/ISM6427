const DEFAULT = { name: "Boca Raton", lat: 26.3587, lon: -80.0831 };

const WEATHER = {
  0: ["Clear", "☀️"], 1: ["Mostly Clear", "🌤️"], 2: ["Partly Cloudy", "⛅"], 3: ["Cloudy", "☁️"],
  45: ["Fog", "🌫️"], 48: ["Fog", "🌫️"],
  51: ["Drizzle", "🌦️"], 53: ["Drizzle", "🌦️"], 55: ["Drizzle", "🌦️"],
  56: ["Freezing Drizzle", "🌧️"], 57: ["Freezing Drizzle", "🌧️"],
  61: ["Light Rain", "🌧️"], 63: ["Rain", "🌧️"], 65: ["Heavy Rain", "🌧️"],
  66: ["Freezing Rain", "🌧️"], 67: ["Freezing Rain", "🌧️"],
  71: ["Light Snow", "🌨️"], 73: ["Snow", "🌨️"], 75: ["Heavy Snow", "❄️"], 77: ["Snow Grains", "❄️"],
  80: ["Showers", "🌦️"], 81: ["Showers", "🌦️"], 82: ["Heavy Showers", "⛈️"],
  85: ["Snow Showers", "🌨️"], 86: ["Snow Showers", "🌨️"],
  95: ["Thunderstorm", "⛈️"], 96: ["Thunderstorm", "⛈️"], 99: ["Thunderstorm", "⛈️"],
};

const $ = (id) => document.getElementById(id);
const describe = (code) => WEATHER[code] || ["Unknown", "🌡️"];
const round = (n) => Math.round(n);

async function loadWeather({ name, lat, lon }) {
  $("city").textContent = name;
  $("condition").textContent = "Loading…";

  const url = "https://api.open-meteo.com/v1/forecast"
    + `?latitude=${lat}&longitude=${lon}`
    + "&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m"
    + "&hourly=temperature_2m,weather_code"
    + "&daily=weather_code,temperature_2m_max,temperature_2m_min,uv_index_max"
    + "&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=7";

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    render(await res.json());
  } catch (err) {
    $("condition").textContent = "Couldn't load weather";
  }
}

function render(data) {
  const { current, hourly, daily } = data;

  $("temp").textContent = `${round(current.temperature_2m)}°`;
  $("condition").textContent = describe(current.weather_code)[0];
  $("hilo").textContent = `H:${round(daily.temperature_2m_max[0])}°  L:${round(daily.temperature_2m_min[0])}°`;
  $("feels").textContent = `${round(current.apparent_temperature)}°`;
  $("humidity").textContent = `${current.relative_humidity_2m}%`;
  $("wind").textContent = `${round(current.wind_speed_10m)} mph`;
  $("uv").textContent = round(daily.uv_index_max[0]);

  // Next 24 hours starting from the current hour
  const start = Math.max(0, hourly.time.findIndex((t) => t >= current.time.slice(0, 13)));
  $("hourly").innerHTML = hourly.time.slice(start, start + 24).map((t, i) => {
    const idx = start + i;
    const hour = new Date(t).getHours();
    const label = i === 0 ? "Now" : `${hour % 12 || 12}${hour < 12 ? "AM" : "PM"}`;
    return `<div class="hour">
      <span>${label}</span>
      <span class="icon">${describe(hourly.weather_code[idx])[1]}</span>
      <span>${round(hourly.temperature_2m[idx])}°</span>
    </div>`;
  }).join("");

  $("daily").innerHTML = daily.time.map((d, i) => {
    const day = i === 0 ? "Today" : new Date(d + "T12:00").toLocaleDateString("en-US", { weekday: "short" });
    return `<li>
      <span>${day}</span>
      <span class="icon">${describe(daily.weather_code[i])[1]}</span>
      <span class="range"><span class="lo">${round(daily.temperature_2m_min[i])}°</span>${round(daily.temperature_2m_max[i])}°</span>
    </li>`;
  }).join("");
}

$("search").addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = $("query").value.trim();
  if (!q) return;

  try {
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1`);
    const data = await res.json();
    const place = data.results && data.results[0];
    if (!place) {
      $("condition").textContent = "City not found";
      return;
    }
    $("query").value = "";
    loadWeather({ name: place.name, lat: place.latitude, lon: place.longitude });
  } catch (err) {
    $("condition").textContent = "Search failed";
  }
});

loadWeather(DEFAULT);
