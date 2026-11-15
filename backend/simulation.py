"""Campos espaciales sintéticos reproducibles; no representan mediciones."""
from math import floor, sqrt
from functools import lru_cache
from .geometry import POLYGON


def contains(x, y, polygon=POLYGON):
    inside = False
    for i, (xi, yi) in enumerate(polygon):
        xj, yj = polygon[i-1]
        if (yi > y) != (yj > y) and x < (xj-xi)*(y-yi)/(yj-yi)+xi:
            inside = not inside
    return inside


@lru_cache(maxsize=8192)
def corner(a, b, seed):
    n = (a*374761393 + b*668265263 + seed*1442695041) & 0xffffffff
    n = ((n ^ (n >> 13))*1274126177) & 0xffffffff
    return ((n ^ (n >> 16))/0xffffffff)*2-1


def noise(x, y, seed):
    """Ruido interpolado estable: manchas orgánicas sin ondas periódicas."""
    ix, iy = floor(x), floor(y)
    tx, ty = x-ix, y-iy
    tx, ty = tx*tx*(3-2*tx), ty*ty*(3-2*ty)
    upper = corner(ix, iy, seed)*(1-tx) + corner(ix+1, iy, seed)*tx
    lower = corner(ix, iy+1, seed)*(1-tx) + corner(ix+1, iy+1, seed)*tx
    return upper*(1-ty) + lower*ty


def texture(x, y, seed):
    return sum(weight*noise(x*scale, y*scale, seed+octave)
               for octave, (scale, weight) in enumerate(((1, .62), (2, .27), (4, .11))))


def simulate(variable, position, field=None):
    width, height = 90, 100
    low, high = variable['limits']
    average = variable['values'][position]
    phase = position * .65
    samples, mask = [], []
    for row in range(height):
        for col in range(width):
            x, y = (col+.5)/width, (row+.5)/height
            # Relieve fijo, lluvia de gran escala y vegetación más heterogénea.
            terrain = texture(x*4, y*4, 17)
            rain = texture(x*3+phase, y*3+phase*.3, 41)
            soil = texture(x*7, y*7, 73)
            moisture = .65*rain - .45*terrain + .2*soil
            vegetation = .6*moisture + .4*texture(x*10, y*10, 97)
            profiles = {
                'precipitation': rain,
                'soil_moisture': moisture,
                'elevation': terrain,
                'evapotranspiration': -.5*moisture + .25*texture(x*4+phase, y*4, 113),
                'air_temperature': -.45*rain + .25*texture(x*3, y*3+phase, 131),
                'NDVI': vegetation,
                'surface_temperature': -.65*vegetation - .25*moisture,
            }
            samples.append(profiles.get(variable['id'], vegetation))
            mask.append(any(contains(x, y, poly[0]) and not any(contains(x, y, hole) for hole in poly[1:])
                            for poly in field['normalized_polygons']) if field else contains(x, y))
    interior = [v for v, inside in zip(samples, mask) if inside]
    if not interior:
        raise ValueError('La delimitación es demasiado pequeña para la grilla de simulación')
    center = sum(interior)/len(interior)
    extent = max(abs(v-center) for v in samples) or 1
    amplitude = max(0, min((high-low)*.24, (average-low)*.85, (high-average)*.85))
    values = [average + amplitude*(v-center)/extent for v in samples]
    interior = [v for v, inside in zip(values, mask) if inside]
    counts = [0, 0, 0, 0]
    for value in interior:
        level = (value-low)/(high-low)
        counts[0 if level >= .66 else 1 if level >= .4 else 2 if level >= .2 else 3] += 1
    percentages = [round(count*100/len(interior), 1) for count in counts]
    # Corrige el redondeo en la zona más poblada.
    largest = counts.index(max(counts))
    percentages[largest] = round(percentages[largest] + 100-sum(percentages), 1)
    metrics = dict(average=average, min=round(min(interior), 2),
                   max=round(max(interior), 2),
                   std=round(sqrt(sum((v-average)**2 for v in interior)/len(interior)), 2),
                   grid=dict(width=width, height=height, values=values, mask=mask))
    return metrics, percentages
