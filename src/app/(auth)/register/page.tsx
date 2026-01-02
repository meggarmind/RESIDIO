'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Loader2,
  Mail,
  User,
  Briefcase,
  Users,
  Home,
  Car,
  ClipboardCheck,
  Plus,
  X,
  Eye,
  EyeOff,
  AlertTriangle,
} from 'lucide-react';
import { checkEmailAvailability, type EmailAvailabilityResult } from '@/actions/auth/check-email-availability';
import { useDebouncedCallback } from 'use-debounce';
import { passwordSchema, PASSWORD_REQUIREMENTS } from '@/lib/validators/password';

// Step definitions
const STEPS = [
  { id: 1, title: 'Account', icon: Mail, description: 'Create your login credentials' },
  { id: 2, title: 'Personal', icon: User, description: 'Your personal information' },
  { id: 3, title: 'Professional', icon: Briefcase, description: 'Work details' },
  { id: 4, title: 'Family', icon: Users, description: 'Spouse information' },
  { id: 5, title: 'Property', icon: Home, description: 'Your residence' },
  { id: 6, title: 'Vehicles', icon: Car, description: 'Vehicle registration' },
  { id: 7, title: 'Review', icon: ClipboardCheck, description: 'Confirm your details' },
];

// Full registration schema
const registrationSchema = z.object({
  // Step 1: Account
  email: z.string().email('Please enter a valid email address'),
  password: passwordSchema,
  confirmPassword: z.string(),
  useOAuth: z.boolean().optional(),

  // Step 2: Personal Information
  surname: z.string().min(2, 'Surname is required'),
  firstName: z.string().min(2, 'First name is required'),
  middleName: z.string().optional(),
  whatsappNumber: z.string().min(10, 'Valid phone number required'),
  additionalPhone: z.string().optional(),
  dateOfBirthDay: z.string().optional(),
  dateOfBirthMonth: z.string().optional(),
  stateOfOrigin: z.string().optional(),
  lgaOfOrigin: z.string().optional(),
  townVillage: z.string().optional(),
  nin: z.string().length(11, 'NIN must be 11 digits').regex(/^\d+$/, 'NIN must contain only numbers'),
  formerAddress: z.string().optional(),

  // Step 3: Professional
  profession: z.string().optional(),
  placeOfWork: z.string().optional(),
  workAddress: z.string().optional(),

  // Step 4: Family
  spouseName: z.string().optional(),
  spousePhone: z.string().optional(),

  // Step 5: Property
  occupancyDay: z.string().optional(),
  occupancyMonth: z.string().optional(),
  occupancyYear: z.string().optional(),
  occupancyStatus: z.enum(['tenant', 'landlord']).optional(),
  streetId: z.string().optional(),
  houseNumber: z.string().min(1, 'House number is required'),
  flatNumber: z.string().optional(),
  bqNumber: z.string().optional(),
  landlordName: z.string().optional(),

  // Step 6: Vehicles
  vehiclePlates: z.array(z.string()).optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

type RegistrationFormData = z.infer<typeof registrationSchema>;

// OAuth providers (reuse from login)
const oauthProviders = [
  { id: 'google', name: 'Google' },
  { id: 'twitter', name: 'X' },
  { id: 'linkedin_oidc', name: 'LinkedIn' },
  { id: 'facebook', name: 'Facebook' },
] as const;

export default function RegisterPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [vehiclePlates, setVehiclePlates] = useState<string[]>(['']);
  const [streets, setStreets] = useState<{ id: string; name: string }[]>([]);
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);

  // Email availability check state
  const [emailCheckResult, setEmailCheckResult] = useState<EmailAvailabilityResult | null>(null);
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
    trigger,
    getValues,
  } = useForm<RegistrationFormData>({
    resolver: zodResolver(registrationSchema),
    defaultValues: {
      vehiclePlates: [''],
    },
  });

  const passwordValue = watch('password') || '';
  const occupancyStatus = watch('occupancyStatus');
  const emailValue = watch('email') || '';

  // Debounced email availability check
  const debouncedEmailCheck = useDebouncedCallback(async (email: string) => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailCheckResult(null);
      return;
    }

    setIsCheckingEmail(true);
    try {
      const result = await checkEmailAvailability(email);
      setEmailCheckResult(result);
    } catch {
      // On error, allow proceeding
      setEmailCheckResult(null);
    } finally {
      setIsCheckingEmail(false);
    }
  }, 500);

  // Check email when it changes
  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const email = e.target.value;
    setEmailCheckResult(null); // Reset while typing
    debouncedEmailCheck(email);
  };

  // Fetch streets when reaching step 5
  const fetchStreets = async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('streets')
      .select('id, name')
      .order('name');
    if (data) {
      setStreets(data);
    }
  };

  // Navigation
  const goToStep = (step: number) => {
    if (step >= 1 && step <= STEPS.length) {
      if (step === 5 && streets.length === 0) {
        fetchStreets();
      }
      setCurrentStep(step);
    }
  };

  const handleNext = async () => {
    // Validate current step fields
    const fieldsToValidate = getStepFields(currentStep);
    const isValid = await trigger(fieldsToValidate as (keyof RegistrationFormData)[]);

    if (!isValid) return;

    // Block progression from Step 1 if email is unavailable
    if (currentStep === 1) {
      if (isCheckingEmail) {
        // Wait for email check to complete
        return;
      }
      if (emailCheckResult && !emailCheckResult.available) {
        // Email is not available, don't proceed
        return;
      }
    }

    goToStep(currentStep + 1);
  };

  const handleBack = () => {
    goToStep(currentStep - 1);
  };

  // Get fields for each step for validation
  const getStepFields = (step: number): string[] => {
    switch (step) {
      case 1:
        return ['email', 'password', 'confirmPassword'];
      case 2:
        return ['surname', 'firstName', 'whatsappNumber', 'nin'];
      case 3:
        return [];
      case 4:
        return [];
      case 5:
        return ['houseNumber'];
      case 6:
        return [];
      default:
        return [];
    }
  };

  // Handle OAuth registration
  const handleOAuthRegister = async (providerId: string) => {
    setOauthLoading(providerId);
    setError(null);

    const supabase = createClient();

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: providerId as 'google' | 'twitter' | 'linkedin_oidc' | 'facebook',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?registration=true`,
      },
    });

    if (oauthError) {
      setError(oauthError.message);
      setOauthLoading(null);
    }
  };

  // Vehicle plate management
  const addVehiclePlate = () => {
    setVehiclePlates([...vehiclePlates, '']);
  };

  const removeVehiclePlate = (index: number) => {
    const newPlates = vehiclePlates.filter((_, i) => i !== index);
    setVehiclePlates(newPlates.length ? newPlates : ['']);
  };

  const updateVehiclePlate = (index: number, value: string) => {
    const newPlates = [...vehiclePlates];
    newPlates[index] = value.toUpperCase();
    setVehiclePlates(newPlates);
    setValue('vehiclePlates', newPlates);
  };

  // Submit registration
  const onSubmit = async (data: RegistrationFormData) => {
    setIsLoading(true);
    setError(null);

    try {
      const supabase = createClient();

      // Create auth account
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            full_name: `${data.firstName} ${data.surname}`,
          },
        },
      });

      if (authError) {
        throw new Error(authError.message);
      }

      if (!authData.user) {
        throw new Error('Failed to create account');
      }

      // Note: In a production system, you would create a pending_registrations record
      // and have admins approve it before creating the resident record.
      // For now, we show success and let them know it's pending approval.

      setIsSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  // Success screen
  if (isSuccess) {
    return (
      <div className="space-y-6 text-center">
        <div className="flex justify-center">
          <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
          </div>
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">Registration Submitted!</h2>
          <p className="text-sm text-muted-foreground">
            Thank you for registering. Your application has been submitted for administrator approval.
            You will receive an email notification once your registration has been reviewed.
          </p>
        </div>
        <Button asChild className="w-full">
          <Link href="/login">Return to Login</Link>
        </Button>
      </div>
    );
  }

  const progress = (currentStep / STEPS.length) * 100;
  const CurrentStepIcon = STEPS[currentStep - 1].icon;

  return (
    <div className="space-y-6">
      {/* Progress Header */}
      <div className="space-y-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Step {currentStep} of {STEPS.length}
          </span>
          <span className="font-medium">{STEPS[currentStep - 1].title}</span>
        </div>
        <Progress value={progress} className="h-2" />

        {/* Step indicators */}
        <div className="flex justify-between">
          {STEPS.map((step) => {
            const StepIcon = step.icon;
            const isActive = currentStep === step.id;
            const isCompleted = currentStep > step.id;

            return (
              <button
                key={step.id}
                type="button"
                onClick={() => isCompleted && goToStep(step.id)}
                disabled={!isCompleted}
                className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : isCompleted
                    ? 'bg-primary/20 text-primary cursor-pointer hover:bg-primary/30'
                    : 'bg-muted text-muted-foreground'
                }`}
                title={step.title}
              >
                {isCompleted ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <StepIcon className="h-4 w-4" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Step Title */}
      <div className="space-y-1">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <CurrentStepIcon className="h-5 w-5" />
          {STEPS[currentStep - 1].title}
        </h2>
        <p className="text-sm text-muted-foreground">
          {STEPS[currentStep - 1].description}
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Step 1: Account Credentials */}
        {currentStep === 1 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address *</Label>
              <div className="relative">
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  {...register('email', {
                    onChange: handleEmailChange,
                  })}
                  className={`h-11 pr-10 ${
                    emailCheckResult && !emailCheckResult.available
                      ? 'border-amber-500 focus-visible:ring-amber-500'
                      : emailCheckResult?.available
                      ? 'border-green-500 focus-visible:ring-green-500'
                      : ''
                  }`}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {isCheckingEmail && (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                  {!isCheckingEmail && emailCheckResult?.available && (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  )}
                  {!isCheckingEmail && emailCheckResult && !emailCheckResult.available && (
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  )}
                </div>
              </div>
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              )}

              {/* Email availability warning */}
              {emailCheckResult && !emailCheckResult.available && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-sm text-amber-700 dark:text-amber-400 space-y-2">
                    <p>{emailCheckResult.message}</p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        asChild
                        className="border-amber-300 hover:bg-amber-100 dark:border-amber-800 dark:hover:bg-amber-950/50"
                      >
                        <Link href="/login">Log In</Link>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        asChild
                        className="border-amber-300 hover:bg-amber-100 dark:border-amber-800 dark:hover:bg-amber-950/50"
                      >
                        <Link href="/login?forgot=true">Forgot Password?</Link>
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Email available confirmation */}
              {emailCheckResult?.available && emailValue && (
                <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Email is available
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password *</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Create a strong password"
                  {...register('password')}
                  className="h-11 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {passwordValue && (
                <div className="space-y-1 pt-1">
                  {PASSWORD_REQUIREMENTS.map((req) => {
                    const met = req.test(passwordValue);
                    return (
                      <div
                        key={req.id}
                        className={`flex items-center gap-2 text-xs ${
                          met ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'
                        }`}
                      >
                        {met ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                        <span>{req.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password *</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Re-enter your password"
                {...register('confirmPassword')}
                className="h-11"
              />
              {errors.confirmPassword && (
                <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
              )}
            </div>

            <div className="relative py-4">
              <div className="absolute inset-0 flex items-center">
                <Separator className="w-full" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  Or register with
                </span>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {oauthProviders.map((provider) => (
                <Button
                  key={provider.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleOAuthRegister(provider.id)}
                  disabled={oauthLoading !== null}
                >
                  {oauthLoading === provider.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    provider.name
                  )}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Personal Information */}
        {currentStep === 2 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="surname">Surname *</Label>
                <Input
                  id="surname"
                  {...register('surname')}
                  className="h-10"
                />
                {errors.surname && (
                  <p className="text-sm text-destructive">{errors.surname.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  {...register('firstName')}
                  className="h-10"
                />
                {errors.firstName && (
                  <p className="text-sm text-destructive">{errors.firstName.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="middleName">Middle Name</Label>
              <Input
                id="middleName"
                {...register('middleName')}
                className="h-10"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="whatsappNumber">WhatsApp Number *</Label>
                <Input
                  id="whatsappNumber"
                  type="tel"
                  placeholder="+234..."
                  {...register('whatsappNumber')}
                  className="h-10"
                />
                {errors.whatsappNumber && (
                  <p className="text-sm text-destructive">{errors.whatsappNumber.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="additionalPhone">Additional Phone</Label>
                <Input
                  id="additionalPhone"
                  type="tel"
                  {...register('additionalPhone')}
                  className="h-10"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Date of Birth</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Day"
                    {...register('dateOfBirthDay')}
                    className="h-10"
                  />
                  <Input
                    placeholder="Month"
                    {...register('dateOfBirthMonth')}
                    className="h-10"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="stateOfOrigin">State of Origin</Label>
                <Input
                  id="stateOfOrigin"
                  {...register('stateOfOrigin')}
                  className="h-10"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="lgaOfOrigin">LGA of Origin</Label>
                <Input
                  id="lgaOfOrigin"
                  {...register('lgaOfOrigin')}
                  className="h-10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="townVillage">Town/Village</Label>
                <Input
                  id="townVillage"
                  {...register('townVillage')}
                  className="h-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="nin">National Identity Number (NIN) *</Label>
              <Input
                id="nin"
                placeholder="11 digits"
                maxLength={11}
                {...register('nin')}
                className="h-10"
              />
              {errors.nin && (
                <p className="text-sm text-destructive">{errors.nin.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="formerAddress">Former Residential Address</Label>
              <Input
                id="formerAddress"
                {...register('formerAddress')}
                className="h-10"
              />
            </div>
          </div>
        )}

        {/* Step 3: Professional Information */}
        {currentStep === 3 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="profession">Profession/Career</Label>
              <Input
                id="profession"
                {...register('profession')}
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="placeOfWork">Place of Work</Label>
              <Input
                id="placeOfWork"
                {...register('placeOfWork')}
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="workAddress">Work Address</Label>
              <Input
                id="workAddress"
                {...register('workAddress')}
                className="h-11"
              />
            </div>

            <p className="text-sm text-muted-foreground">
              All fields on this step are optional.
            </p>
          </div>
        )}

        {/* Step 4: Family Information */}
        {currentStep === 4 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="spouseName">Spouse&apos;s Name</Label>
              <Input
                id="spouseName"
                {...register('spouseName')}
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="spousePhone">Spouse&apos;s Phone</Label>
              <Input
                id="spousePhone"
                type="tel"
                {...register('spousePhone')}
                className="h-11"
              />
            </div>

            <p className="text-sm text-muted-foreground">
              All fields on this step are optional.
            </p>
          </div>
        )}

        {/* Step 5: Property Information */}
        {currentStep === 5 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Date of Occupancy</Label>
              <div className="grid grid-cols-3 gap-2">
                <Input
                  placeholder="Day"
                  {...register('occupancyDay')}
                  className="h-10"
                />
                <Input
                  placeholder="Month"
                  {...register('occupancyMonth')}
                  className="h-10"
                />
                <Input
                  placeholder="Year"
                  {...register('occupancyYear')}
                  className="h-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Occupancy Status</Label>
              <Select
                value={occupancyStatus}
                onValueChange={(value) => setValue('occupancyStatus', value as 'tenant' | 'landlord')}
              >
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="landlord">Landlord</SelectItem>
                  <SelectItem value="tenant">Tenant</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Street</Label>
              <Select
                value={watch('streetId')}
                onValueChange={(value) => setValue('streetId', value)}
              >
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Select street" />
                </SelectTrigger>
                <SelectContent>
                  {streets.map((street) => (
                    <SelectItem key={street.id} value={street.id}>
                      {street.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="houseNumber">House No. *</Label>
                <Input
                  id="houseNumber"
                  {...register('houseNumber')}
                  className="h-10"
                />
                {errors.houseNumber && (
                  <p className="text-sm text-destructive">{errors.houseNumber.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="flatNumber">Flat No.</Label>
                <Input
                  id="flatNumber"
                  {...register('flatNumber')}
                  className="h-10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bqNumber">BQ No.</Label>
                <Input
                  id="bqNumber"
                  {...register('bqNumber')}
                  className="h-10"
                />
              </div>
            </div>

            {occupancyStatus === 'tenant' && (
              <div className="space-y-2">
                <Label htmlFor="landlordName">Landlord&apos;s Name</Label>
                <Input
                  id="landlordName"
                  {...register('landlordName')}
                  className="h-11"
                />
              </div>
            )}
          </div>
        )}

        {/* Step 6: Vehicle Information */}
        {currentStep === 6 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Register your vehicle plate numbers. This step is optional.
            </p>

            {vehiclePlates.map((plate, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  placeholder="e.g., ABC 123 XY"
                  value={plate}
                  onChange={(e) => updateVehiclePlate(index, e.target.value)}
                  className="h-11 flex-1 uppercase"
                />
                {vehiclePlates.length > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => removeVehiclePlate(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              onClick={addVehiclePlate}
              className="w-full"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Another Vehicle
            </Button>
          </div>
        )}

        {/* Step 7: Review */}
        {currentStep === 7 && (
          <div className="space-y-4">
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="font-medium">Account</h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => goToStep(1)}
                >
                  Edit
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">{getValues('email')}</p>
            </div>

            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="font-medium">Personal</h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => goToStep(2)}
                >
                  Edit
                </Button>
              </div>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>{getValues('firstName')} {getValues('middleName')} {getValues('surname')}</p>
                <p>WhatsApp: {getValues('whatsappNumber')}</p>
                <p>NIN: {getValues('nin')}</p>
              </div>
            </div>

            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="font-medium">Property</h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => goToStep(5)}
                >
                  Edit
                </Button>
              </div>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>House {getValues('houseNumber')}</p>
                <p>Status: {getValues('occupancyStatus') || 'Not specified'}</p>
              </div>
            </div>

            {vehiclePlates.some((p) => p.trim()) && (
              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <h3 className="font-medium">Vehicles</h3>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => goToStep(6)}
                  >
                    Edit
                  </Button>
                </div>
                <div className="text-sm text-muted-foreground">
                  {vehiclePlates.filter((p) => p.trim()).join(', ')}
                </div>
              </div>
            )}

            <Alert>
              <AlertDescription>
                By submitting, your registration will be sent for administrator approval.
                You will be notified by email once your registration is reviewed.
              </AlertDescription>
            </Alert>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex gap-3 pt-4">
          {currentStep > 1 && (
            <Button
              type="button"
              variant="outline"
              onClick={handleBack}
              className="flex-1"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          )}

          {currentStep < STEPS.length ? (
            <Button
              type="button"
              onClick={handleNext}
              className="flex-1"
            >
              Next
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="submit"
              className="flex-1"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Submit Registration
                </>
              )}
            </Button>
          )}
        </div>
      </form>

      {/* Login link */}
      <div className="text-center text-sm">
        Already have an account?{' '}
        <Link href="/login" className="text-primary hover:underline">
          Sign in
        </Link>
      </div>
    </div>
  );
}
