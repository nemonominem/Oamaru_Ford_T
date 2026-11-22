export interface UnityScriptFile {
  filename: string;
  summary: string;
  code: string;
}

export const UNITY_CSHARP_SCRIPTS: UnityScriptFile[] = [
  {
    filename: 'OamaruAtmosphereWeather.cs',
    summary: 'Unity Time-of-Day solar/lunar lighting cycle, coastal fog, rain particle system, streetlamp activation, and wet-road traction hooks.',
    code: `using UnityEngine;

public enum OamaruWeather { Sun, Rain, Fog }

public class OamaruAtmosphereWeather : MonoBehaviour
{
    [Header("Cycle & Weather")]
    public OamaruWeather weather = OamaruWeather.Sun;
    [Range(0f, 24f)] public float timeOfDayHour = 14f;
    public bool autoCycle = false;
    public float cycleSpeedHoursPerSec = 0.6f;

    [Header("Scene References")]
    public Light sunLight;
    public ParticleSystem rainParticles;
    public Light[] streetLamps;
    public Light[] modelTHeadlamps;
    public Material cobbleRoadMat;

    public float CurrentWetness { get; private set; }
    public float EffectiveGripMultiplier { get; private set; } = 1f;

    void Update()
    {
        if (autoCycle)
        {
            timeOfDayHour = (timeOfDayHour + Time.deltaTime * cycleSpeedHoursPerSec) % 24f;
        }

        // Solar elevation arc (sunrise ~6:00, sunset ~18:30)
        float dayAngle = ((timeOfDayHour - 6f) / 12.5f) * Mathf.PI;
        float sunElevation = Mathf.Sin(dayAngle);
        float nightFactor = Mathf.Clamp01((-sunElevation + 0.12f) * 1.8f);

        sunLight.transform.rotation = Quaternion.Euler(Mathf.Lerp(6f, 62f, Mathf.Max(0f, sunElevation)), 130f, 0f);
        sunLight.intensity = Mathf.Lerp(2.1f, 0.25f, nightFactor) * (weather == OamaruWeather.Sun ? 1f : 0.55f);
        sunLight.color = Color.Lerp(new Color(1f, 0.94f, 0.84f), new Color(0.45f, 0.56f, 0.78f), nightFactor);

        // Coastal fog & rain emitters
        float targetFog = weather == OamaruWeather.Fog ? 0.025f : (weather == OamaruWeather.Rain ? 0.011f : 0.004f);
        RenderSettings.fog = true;
        RenderSettings.fogMode = FogMode.ExponentialSquared;
        RenderSettings.fogDensity = Mathf.Lerp(RenderSettings.fogDensity, targetFog, Time.deltaTime * 2f);

        CurrentWetness = Mathf.MoveTowards(CurrentWetness, weather == OamaruWeather.Rain ? 1f : (weather == OamaruWeather.Fog ? 0.35f : 0f), Time.deltaTime * 0.4f);
        if (cobbleRoadMat) cobbleRoadMat.SetFloat("_Glossiness", 0.22f + CurrentWetness * 0.58f);

        if (rainParticles)
        {
            var emission = rainParticles.emission;
            emission.enabled = weather == OamaruWeather.Rain;
        }

        // Dusk / Night Streetlamps & Model T Brass Headlamps
        foreach (var lamp in streetLamps)
            if (lamp) lamp.intensity = nightFactor * 2.4f;

        foreach (var head in modelTHeadlamps)
            if (head) head.enabled = nightFactor > 0.35f || weather == OamaruWeather.Fog;

        // Expose grip multiplier for FordModelTController & OamaruRoadSurface
        float dew = (timeOfDayHour >= 20f || timeOfDayHour <= 6.5f) ? 0.93f : 1f;
        EffectiveGripMultiplier = (weather == OamaruWeather.Rain ? 0.72f : (weather == OamaruWeather.Fog ? 0.88f : 1f)) * dew;
    }
}`,
  },
  {
    filename: 'FordModelTController.cs',
    summary: 'Unity Rigidbody + WheelCollider Ford Model T physics with 2.9L torque curve, spark advance, and weather/dew traction integration.',
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

        // Pacific coastal crosswind gust during rain
        if (atmosphere && atmosphere.weather == OamaruWeather.Rain)
            rb.AddForce(Vector3.left * 95f, ForceMode.Force);

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
    summary: 'Dynamic WheelCollider friction & suspension vibration for Oamaru Macadam, Cobbles, Mud Ruts, and Wharf Timber scaled by Weather.',
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
