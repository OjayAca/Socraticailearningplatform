export interface MethodReference {
  name: string;
  statement: string;
  domain: "Quantitative Methods" | "Discrete Mathematics";
  variables: Record<string,string>;
  conditions: string[];
  equivalentConditions: string[][];
  alternativeMethods: string[];
  commonMisconceptions: string[];
  acceptedJustifications: string[];
}
const reference = (
  name: string,
  statement: string,
  domain: "Quantitative Methods" | "Discrete Mathematics",
  variables: Record<string,string>,
  conditions: string[],
  equivalentConditions: string[][],
  alternativeMethods: string[],
  commonMisconceptions: string[],
  acceptedJustifications: string[],
): MethodReference => ({
  name,
  statement,
  domain,
  variables,
  conditions,
  equivalentConditions,
  alternativeMethods,
  commonMisconceptions,
  acceptedJustifications,
});
/** General definitions for the bounded, deterministically checked custom-problem families. */
export const METHOD_REFERENCES: Record<string,MethodReference> = {
  mean:reference(
    "Arithmetic mean",
    "mean = sum(x_i)/n",
    "Quantitative Methods",
    {x_i:"An observation",n:"Number of observations"},
    ["Nonempty finite numerical dataset","Each observation has equal weight"],
    [["equal weight","contribute equally","same importance","equally weighted","equal share","weighted equally","same weight","uniform weight"]],
    ["Frequency-weighted mean sum(f_i * x_i)/n","Deviation from an assumed reference value"],
    ["Dividing by the largest value instead of the count"],
    ["Explain that equal sharing preserves the total across n observations"],
  ),
  median:reference(
    "Median",
    "Middle ordered value; average the two middle values when n is even",
    "Quantitative Methods",
    {n:"Number of observations"},
    ["Order a nonempty numerical dataset"],
    [["ordered","sorted","arranged in order","ascending order","descending order","ranked","middle position"]],
    ["50th percentile position","Split ordered observations into equal lower and upper halves"],
    ["Using the middle input before sorting"],
    ["Use ordered positions to split the observations into two halves"],
  ),
  mode:reference(
    "Mode",
    "Value or values with greatest frequency",
    "Quantitative Methods",
    {},
    ["Count every occurrence","In this application's stated convention, all distinct values give no mode"],
    [["highest frequency","greatest frequency","most frequent","occurs most often","appears most","repeated most"]],
    ["Frequency distribution table comparison"],
    ["Assuming a dataset always has exactly one mode"],
    ["Compare frequencies and retain all ties for the greatest repeated frequency"],
  ),
  range:reference(
    "Range",
    "max(x_i) - min(x_i)",
    "Quantitative Methods",
    {x_i:"An observation"},
    ["Nonempty numerical dataset"],
    [["maximum minus minimum","largest minus smallest","highest minus lowest","difference between extreme values","spread between extremes"]],
    ["Sorting the dataset first to read the extreme endpoints"],
    ["Subtracting first and last unsorted observations"],
    ["Identify the largest and smallest observations before subtraction"],
  ),
  probability:reference(
    "Equally likely outcome probability",
    "P(E) = favorable / total",
    "Quantitative Methods",
    {E:"Event",favorable:"Number of event outcomes",total:"Number of sample-space outcomes"},
    ["Outcomes are equally likely","Total is positive","The event is a subset of the sample space"],
    [["equally likely","uniform probability","same chance","equal chance","fair","each outcome has equal probability"]],
    ["Complement rule 1 - P(E^c)","Sum of mutually exclusive elementary event probabilities"],
    ["Using counts when outcomes are not equally likely"],
    ["Explain equal likelihood and identify the event and full sample space"],
  ),
  product:reference(
    "Multiplication principle",
    "N = n_1 * ... * n_k",
    "Discrete Mathematics",
    {n_i:"Available choices at stage i"},
    ["Each partial choice permits the stated number of choices at the next stage"],
    [["independent choices at each stage","fixed number of options per stage","sequential stages","every branch has the same number of choices"]],
    ["Decision tree enumeration","Cartesian product cardinality |A x B| = |A| * |B|"],
    ["Multiplying counts that depend on previous choices without accounting for that dependence"],
    ["Describe the successive stages and verify the available choices at each stage"],
  ),
  permutation:reference(
    "Ordered selection without replacement",
    "P(n,r) = n!/(n-r)!",
    "Discrete Mathematics",
    {n:"Distinct available objects",r:"Objects selected"},
    ["0 <= r <= n are integers","Order matters","No replacement"],
    [["order matters","arrangement matters","sequence matters","distinct positions","without replacement","no repetition"]],
    ["Sequential multiplication n * (n-1) * ... * (n-r+1)"],
    ["Using permutations for unordered groups"],
    ["Explain why changing order changes the outcome and why choices cannot repeat"],
  ),
  combination:reference(
    "Unordered selection without replacement",
    "C(n,r) = n!/[r!(n-r)!]",
    "Discrete Mathematics",
    {n:"Distinct available objects",r:"Objects selected"},
    ["0 <= r <= n are integers","Order does not matter","No replacement"],
    [["order does not matter","unordered","order is irrelevant","subset selection","committee or group without roles","without replacement"]],
    ["Divide ordered permutations P(n,r) by r!"],
    ["Counting different arrangements of the same group separately"],
    ["Explain why each unordered group appears r! times among ordered selections"],
  ),
  "function evaluation":reference(
    "Function evaluation",
    "f(a) is obtained by substituting a for every x in the given expression",
    "Quantitative Methods",
    {a:"Input in the domain",x:"Function argument"},
    ["Use the supplied function and an input in its domain","Respect parentheses and operation order"],
    [["substitute input","replace x","in the domain","order of operations","each input maps to a single output"]],
    ["Input-output mapping table","Stepwise composition of elementary operations"],
    ["Treating a negative input squared as a negative square"],
    ["Explain substitution into the supplied expression and check that the input is allowed"],
  ),
  logic:reference(
    "Propositional connectives",
    "NOT reverses truth; AND requires both true; OR requires at least one true",
    "Discrete Mathematics",
    {},
    ["Each variable has a truth assignment","Respect parentheses and connective precedence"],
    [["truth assignment","truth table","both true","at least one true","reverses truth value","logical equivalence","de morgan"]],
    ["Truth table row evaluation","Algebraic simplification via logical equivalences (De Morgan, distributive laws)"],
    ["Treating inclusive OR as exclusive OR"],
    ["Apply the relevant truth-table row to each subexpression"],
  ),
  union:reference(
    "Set union",
    "A union B contains elements in A or B or both",
    "Discrete Mathematics",
    {A:"First set",B:"Second set"},
    ["Membership is decisive; duplicates do not change a set"],
    [["in either set","in a or b","at least one set","combine elements without duplicates","belong to either"]],
    ["Inclusion-exclusion principle","Membership table over the universal set"],
    ["Retaining only shared members"],
    ["Check membership in at least one operand and remove duplicates"],
  ),
  intersection:reference(
    "Set intersection",
    "A intersection B contains elements in both A and B",
    "Discrete Mathematics",
    {A:"First set",B:"Second set"},
    ["Each included element belongs to both operands"],
    [["in both sets","shared elements","common to both","in a and b","simultaneous membership"]],
    ["Element-by-element filter","Membership table for conjunction"],
    ["Including elements in only one operand"],
    ["Verify membership in both sets for each included element"],
  ),
  difference:reference(
    "Set difference",
    "A minus B contains elements in A that are not in B",
    "Discrete Mathematics",
    {A:"First set",B:"Second set"},
    ["Operand order matters"],
    [["in the first set but not the second","in a and not in b","remove shared elements from a","relative complement"]],
    ["Intersection with complement A intersect B^c"],
    ["Treating difference as commutative"],
    ["Check membership in A and absence from B"],
  ),
};
for (const population of [true,false]) {
  const prefix=population ? "population" : "sample";
  const variance=reference(
    `${prefix} variance`,
    population ? "variance = sum((x_i - mean)^2)/n" : "s^2 = sum((x_i - mean)^2)/(n-1)",
    "Quantitative Methods",
    {x_i:"Observation",n:"Number of observations"},
    [population ? "The dataset is the full population; n >= 1" : "The observations form a sample; n >= 2", "Use squared deviations from the arithmetic mean"],
    [
      population
        ? ["full population","entire group","every member","all members of the group","complete population","divide by n"]
        : ["sample from a population","subset of the population","bessel correction","divide by n-1","divide by n minus 1","estimate population variance"],
      ["squared deviations","square the deviations","deviations from the mean"],
    ],
    [population ? "Computational formula E[X^2] - (E[X])^2" : "Computational sample formula (sum(x_i^2) - (sum x_i)^2/n)/(n-1)"],
    ["Confusing the population and sample denominators","Averaging signed deviations without squaring"],
    ["Identify population versus sample from the question and justify its denominator"],
  );
  METHOD_REFERENCES[`${prefix} variance`]=variance;
  METHOD_REFERENCES[`${prefix} standard deviation`]={
    ...variance,
    name:`${prefix} standard deviation`,
    statement:`standard deviation = sqrt(${prefix} variance)`,
    commonMisconceptions:[...variance.commonMisconceptions,"Omitting the final square root"],
    acceptedJustifications:[...variance.acceptedJustifications,"Explain that the square root restores the original measurement units"],
  };
}
