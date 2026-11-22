export interface UnityScriptFile {
  filename: string;
  summary: string;
  code: string;
}

export const UNITY_CSHARP_SCRIPTS: UnityScriptFile[] = [
  {
    filename: 'OamaruAtmosphereWeather.cs',
    summary: 'Unity seasonal Day-of-Year solar arc (45.1°S), likely weather selector (Sunny/Cloudy/Rainy/Snowy/Windy), particles, and traction.',
    code: `using UnityEngine;

public enum OamaruWeather { Sunny, Cloudy, Rainy, Snowy, Windy }

public class OamaruAtmosphereWeather : MonoBehaviour
{
    [Header("Season, Date & Time (Oamaru 45.1°S)")]
    [Range(1, 365)] public int dayOfYear = 45;
    [Range(0f, 24f)] public float timeOfDayHour = 14f;
    public bool autoCycleTime = false;
    public float cycleSpeedHoursPerSec = 0.6f;

    [Header("Weather")]
    public OamaruWeather weather = OamaruWeather.Sunny;
    public bool autoSeasonalWeather = true;

    [Header("Scene References")]
    public Light sunLight;
    public ParticleSystem rainParticles;
    public ParticleSystem snowParticles;
    public ParticleSystem windDustParticles;
    public Light[] streetLamps;
    public Light[] modelTHeadlamps;
    public Material cobbleRoadMat;

    public float CurrentWetness { get; private set; }
    public float CurrentSnowCover { get; private set; }
    public float WindMetersPerSec { get; private set; }
    public float EffectiveGripMultiplier { get; private set; } = 1f;

    public void SelectLikelyWeatherForDateAndTime()
    {
        float seasonalCos = Mathf.Cos(((dayOfYear - 355f) / 365f) * Mathf.PI * 2f);
        bool isWinter = seasonalCos < -0.4f;
        bool isSpring = dayOfYear >= 244 && dayOfYear <= 334;
        float roll = Mathf.Abs(Mathf.Sin(dayOfYear * 12.9898f + Mathf.Floor(timeOfDayHour) * 78.233f) * 43758.54f) % 1f;

        if (isWinter)
        {
            if (roll < 0.20f) weather = OamaruWeather.Sunny;
            else if (roll < 0.54f) weather = OamaruWeather.Cloudy;
            else if (roll < 0.76f) weather = OamaruWeather.Rainy;
            else if (roll < 0.90f) weather = OamaruWeather.Snowy;
            else weather = OamaruWeather.Windy;
        }
        else if (isSpring)
        {
            weather = roll < 0.26f ? OamaruWeather.Sunny : (roll < 0.56f ? OamaruWeather.Cloudy : (roll < 0.74f ? OamaruWeather.Rainy : OamaruWeather.Windy));
        }
        else
        {
            weather = roll < 0.46f ? OamaruWeather.Sunny : (roll < 0.76f ? OamaruWeather.Cloudy : (roll < 0.89f ? OamaruWeather.Rainy : OamaruWeather.Windy));
        }
    }

    void Update()
    {
        if (autoCycleTime)
        {
            timeOfDayHour = (timeOfDayHour + Time.deltaTime * cycleSpeedHoursPerSec) % 24f;
        }

        // Southern Hemisphere astronomical daylight span
        float seasonalCos = Mathf.Cos(((dayOfYear - 355f) / 365f) * Mathf.PI * 2f);
        float halfDay = 6.05f + seasonalCos * 1.65f;
        float sunrise = 12.65f - halfDay;
        float sunset = 12.65f + halfDay;
        float dayAngle = ((timeOfDayHour - sunrise) / Mathf.Max(4f, sunset - sunrise)) * Mathf.PI;
        float sunElevation = Mathf.Sin(dayAngle);
        float nightFactor = Mathf.Clamp01((-sunElevation + 0.12f) * 1.8f);

        float maxElev = Mathf.Lerp(28f, 68f, (seasonalCos + 1f) * 0.5f);
        sunLight.transform.rotation = Quaternion.Euler(Mathf.Lerp(6f, maxElev, Mathf.Max(0f, sunElevation)), 130f, 0f);

        float weatherDim = weather == OamaruWeather.Sunny ? 1f : (weather == OamaruWeather.Windy ? 0.88f : 0.54f);
        sunLight.intensity = Mathf.Lerp(2.15f, 0.25f, nightFactor) * weatherDim;
        sunLight.color = Color.Lerp(new Color(1f, 0.94f, 0.84f), new Color(0.45f, 0.56f, 0.78f), nightFactor);

        float targetFog = weather == OamaruWeather.Snowy ? 0.015f : (weather == OamaruWeather.Rainy ? 0.011f : (weather == OamaruWeather.Cloudy ? 0.0068f : 0.0042f));
        RenderSettings.fog = true;
        RenderSettings.fogMode = FogMode.ExponentialSquared;
        RenderSettings.fogDensity = Mathf.Lerp(RenderSettings.fogDensity, targetFog, Time.deltaTime * 2f);

        CurrentWetness = Mathf.MoveTowards(CurrentWetness, weather == OamaruWeather.Rainy ? 1f : (weather == OamaruWeather.Cloudy ? 0.14f : 0f), Time.deltaTime * 0.4f);
        CurrentSnowCover = Mathf.MoveTowards(CurrentSnowCover, weather == OamaruWeather.Snowy ? 1f : 0f, Time.deltaTime * 0.25f);
        WindMetersPerSec = weather == OamaruWeather.Windy ? 14.5f + Mathf.Sin(Time.time * 0.8f) * 3.5f : (weather == OamaruWeather.Rainy ? 8f : 2f);

        if (cobbleRoadMat) cobbleRoadMat.SetFloat("_Glossiness", 0.22f + CurrentWetness * 0.58f);

        SetEmission(rainParticles, weather == OamaruWeather.Rainy);
        SetEmission(snowParticles, weather == OamaruWeather.Snowy);
        SetEmission(windDustParticles, weather == OamaruWeather.Windy);

        foreach (var lamp in streetLamps)
            if (lamp) lamp.intensity = nightFactor * 2.4f;

        foreach (var head in modelTHeadlamps)
            if (head) head.enabled = nightFactor > 0.35f || weather == OamaruWeather.Rainy || weather == OamaruWeather.Snowy;

        float dew = (timeOfDayHour >= sunset + 1f || timeOfDayHour <= sunrise) ? 0.93f : 1f;
        EffectiveGripMultiplier = (1f - 0.28f * CurrentWetness) * (1f - 0.40f * CurrentSnowCover) * dew;
    }

    private void SetEmission(ParticleSystem ps, bool enabled)
    {
        if (!ps) return;
        var em = ps.emission;
        em.enabled = enabled;
    }
}`,
  },
  {
    filename: 'FordModelTController.cs',
    summary: 'Unity Rigidbody + WheelCollider Ford Model T physics with 2.9L torque curve, spark advance, and seasonal wind/traction.',
    code: `using UnityEngine;

[RequireComponent(typeof(Rigidbody))]
public class FordModelTController : MonoBehaviour
{
    public WheelCollider frontLeft, frontRight, rearLeft, rearRight;
    public OamaruAtmosphereWeather atmosphere;

    [Range(0f, 1f)] public float handThrottle = 0.15f;
    [Range(0f, 1f)] public float sparkAdvance = 0.40f;
    [Range(0f, 1f)] public float handbrakeLever = 0.50f;

    public bool lowPedalPressed, reversePedalPressed, brakePedalPressed;
    public bool engineRunning = true;

    public float currentRpm { get; private set; } = 520f;
    public float speedMph { get; private set; }
    public string activeGear { get; private set; } = "N";

    private Rigidbody rb;
    private const float DiffRatio = 3.63f;

    void Awake()
    {
        rb = GetComponent<Rigidbody>();
        rb.mass = 580f;
        rb.centerOfMass = new Vector3(0f, 0.42f, -0.05f);
    }

    void FixedUpdate()
    {
        speedMph = rb.velocity.magnitude * 2.23694f;
        float steerAngle = Input.GetAxis("Horizontal") * 32f;
        frontLeft.steerAngle = steerAngle;
        frontRight.steerAngle = steerAngle * 0.94f;

        float gearRatio = 0f;
        if (reversePedalPressed) { gearRatio = -4.00f * DiffRatio; activeGear = "REV"; }
        else if (lowPedalPressed) { gearRatio = 2.75f * DiffRatio; activeGear = "LOW"; }
        else if (handbrakeLever < 0.25f) { gearRatio = 1.00f * DiffRatio; activeGear = "HIGH"; }
        else { activeGear = "N"; }

        float wheelRpm = (rearLeft.rpm + rearRight.rpm) * 0.5f;
        float targetIdleRpm = 420f + handThrottle * 1450f;
        currentRpm = gearRatio == 0f
            ? Mathf.MoveTowards(currentRpm, targetIdleRpm, 1800f * Time.fixedDeltaTime)
            : Mathf.Clamp(Mathf.Lerp(targetIdleRpm, Mathf.Abs(wheelRpm * gearRatio), 0.72f), 220f, 2100f);

        float engineNm = EvaluateModelTTorque(currentRpm, handThrottle, sparkAdvance);
        float axleTorque = engineRunning && gearRatio != 0f ? engineNm * gearRatio * 0.86f : 0f;
        rearLeft.motorTorque = axleTorque * 0.5f;
        rearRight.motorTorque = axleTorque * 0.5f;

        // Pacific coastal crosswind gusts (windy & stormy days)
        if (atmosphere && atmosphere.WindMetersPerSec > 3f)
            rb.AddForce(Vector3.left * (atmosphere.WindMetersPerSec * 14.5f), ForceMode.Force);

        float brakeTorque = (brakePedalPressed ? 1600f : 0f) + (handbrakeLever > 0.75f ? 2200f : 0f);
        rearLeft.brakeTorque = brakeTorque;
        rearRight.brakeTorque = brakeTorque;
    }

    private float EvaluateModelTTorque(float rpm, float throttle, float spark)
    {
        if (!engineRunning || rpm < 180f) return 0f;
        float norm = Mathf.Clamp01((rpm - 350f) / 1450f);
        float peakNm = 112f * (0.68f + 0.56f * Mathf.Sin(norm * Mathf.PI * 0.88f));
        float optimalSpark = Mathf.Clamp((rpm - 450f) / 1100f, 0.12f, 0.92f);
        float sparkEff = 1f - Mathf.Min(0.45f, Mathf.Abs(spark - optimalSpark) * 0.55f);
        return peakNm * (0.08f + 0.92f * throttle) * sparkEff;
    }
}`,
  },
  {
    filename: 'OamaruRoadSurface.cs',
    summary: 'Dynamic WheelCollider friction & suspension vibration for Oamaru Macadam, Cobbles, Mud Ruts, and Wharf Timber scaled by seasonal weather.',
    code: `using UnityEngine;

public enum OamaruSurfaceType { Macadam, Cobbles, MudRuts, WharfTimber, TussockGrass }

public class OamaruRoadSurface : MonoBehaviour
{
    public OamaruAtmosphereWeather atmosphere;
    public Rigidbody carRigidbody;

    public void ApplySurfacePhysics(WheelCollider wheel, OamaruSurfaceType surface, float rutNoise)
    {
        WheelFrictionCurve fwd = wheel.forwardFriction;
        WheelFrictionCurve side = wheel.sidewaysFriction;
        float weatherMult = atmosphere ? atmosphere.EffectiveGripMultiplier : 1f;

        switch (surface)
        {
            case OamaruSurfaceType.Macadam:
                fwd.stiffness = 1.00f * weatherMult;
                side.stiffness = 0.92f * weatherMult;
                break;
            case OamaruSurfaceType.Cobbles:
                fwd.stiffness = 0.90f * weatherMult;
                side.stiffness = 0.82f * weatherMult;
                carRigidbody.AddForceAtPosition(Vector3.up * (Mathf.Sin(Time.time * 42f) * 140f), wheel.transform.position);
                break;
            case OamaruSurfaceType.MudRuts:
                fwd.stiffness = 0.52f * weatherMult;
                side.stiffness = 0.45f * weatherMult;
                carRigidbody.AddTorque(Vector3.up * rutNoise * (weatherMult < 0.85f ? 240f : 180f));
                break;
            case OamaruSurfaceType.WharfTimber:
                fwd.stiffness = 0.95f * weatherMult;
                side.stiffness = 0.86f * weatherMult;
                break;
            default:
                fwd.stiffness = 0.72f * weatherMult;
                side.stiffness = 0.65f * weatherMult;
                break;
        }

        wheel.forwardFriction = fwd;
        wheel.sidewaysFriction = side;
    }
}`,
  },
];
