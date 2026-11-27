"""Prepare the Atelier Anime 01 v0.3 PNG package for the shared OpenBone loader."""
import argparse
import json
import math
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

CELL = 12
ORIGIN = (512, 1536)


def smooth(value, low, high):
    t = min(1, max(0, (value - low) / (high - low)))
    return t * t * (3 - 2 * t)


def mix(first, second, amount):
    result = {bone: weight * (1 - amount) for bone, weight in first.items()}
    for bone, weight in second.items():
        result[bone] = result.get(bone, 0) + weight * amount
    return result


def pose_setup(parts):
    pivots = {part["id"]: (part["pivot"]["x"], part["pivot"]["y"]) for part in parts}
    joints = {}

    def joint(name, point, tip=None, limb=False):
        x, y = point
        entry = {"position": [x - ORIGIN[0], ORIGIN[1] - y]}
        if tip:
            dx, dy = tip[0] - x, y - tip[1]
            entry["length"] = round(math.hypot(dx, dy), 3)
            if limb:
                entry["angle"] = round(math.degrees(math.atan2(dy, dx)), 5)
        joints[name] = entry

    # The 3D controller's torso origin is at the waist and the head turns at the chin.
    x, _ = pivots["torso"]
    joint("pelvis", pivots["pelvis"])
    joint("torso", (x, 530))
    joint("head", (pivots["head_base"][0], 211))
    # Controller sides are from the viewer. Source suffixes are from the character.
    for side, suffix in (("left", "R"), ("right", "L")):
        shoulder, elbow, wrist, hip, knee, ankle = (
            pivots[f"{name}_{suffix}"]
            for name in ("upper_arm", "forearm", "hand", "thigh", "shin", "foot")
        )
        palm = (167, 761) if suffix == "R" else (852, 761)
        toe = (390, 1510) if suffix == "R" else (626, 1510)
        for name, point, tip in (
            ("Arm", shoulder, elbow), ("Elbow", elbow, wrist), ("Forearm", elbow, wrist),
            ("Hand", wrist, palm), ("Thigh", hip, knee), ("Knee", knee, ankle), ("Shin", knee, ankle),
            ("Foot", ankle, toe),
        ):
            joint(side + name, point, None if name in ("Elbow", "Knee") else tip, limb=True)
            if name in ("Elbow", "Knee"):
                # The hinge frame's reference direction is the proximal segment.
                joints[side + name]["angle"] = joints[side + ("Arm" if name == "Elbow" else "Thigh")]["angle"]
    return joints, pivots


def weight_field(pivots, x, y):
    """Shared weights evaluated at the same canvas points on both sides of every seam."""
    neck_y = pivots["neck"][1]
    center = mix({"pelvis": 1}, {"torso": 1}, 1 - smooth(y, 469, 590))
    center = mix(center, {"head": 1}, 1 - smooth(y, neck_y - 45, neck_y + 27))
    side, suffix, sign = ("left", "R", -1) if x < 510 else ("right", "L", 1)

    def along(start, end):
        px, py = pivots[start + "_" + suffix]
        tx, ty = pivots[end + "_" + suffix]
        dx, dy = tx - px, ty - py
        return ((x - px) * dx + (y - py) * dy) / math.hypot(dx, dy)

    def hinge(before, middle, after, distance, radius):
        t = smooth(distance, -radius, radius)
        blend = mix({side + before: 1}, {side + after: 1}, t)
        return mix(blend, {side + middle: 1}, .86 * (1 - smooth(abs(distance), 0, radius)))

    hip_y = pivots["thigh_" + suffix][1]
    knee_y = pivots["shin_" + suffix][1]
    ankle_y = pivots["foot_" + suffix][1]
    leg = hinge("Thigh", "Knee", "Shin", y - knee_y, 58)
    leg = mix(leg, {side + "Foot": 1}, smooth(y, ankle_y - 35, ankle_y + 38))
    # At the centerline the pelvis has a narrow transition between the two hips.
    hip_spread = smooth(abs(x - 510), 4, 34)
    if y > hip_y + 44:
        hip_spread = 1
    center = mix(center, leg, smooth(y, hip_y - 63, hip_y + 44) * hip_spread)

    sx, sy = pivots["upper_arm_" + suffix]
    # Keep the transition inside the armpit cut, then in the transparent gap
    # between the forearm and the waist. No influence reaches the other limbs.
    inward = min(6, max(0, y - sy) * .15) + min(13, max(0, y - 365) * .25)
    seam = sx + sign * (max(0, y - 423) * .42 - inward)
    arm_weight = (smooth(sign * (x - seam), -12, 20) * smooth(y, sy - 37, sy + 16)
                  * (1 - smooth(y, 816, 840)))
    elbow = hinge("Arm", "Elbow", "Forearm", along("forearm", "hand"), 45)
    wrist = smooth(along("hand", "forearm"), -34, 28)
    arm = mix(elbow, {side + "Hand": 1}, 1 - wrist)
    return mix(center, arm, arm_weight)


def neutral_coverage(master):
    """Apply flat, opaque basewear before slicing or weighting any segment."""
    mask = Image.new("RGBA", (master.width * 3, master.height * 3))
    draw = ImageDraw.Draw(mask)

    def panel(points, color):
        draw.polygon([(x * 3, y * 3) for x, y in points], fill=color)

    panel([(396, 343), (418, 322), (447, 314), (566, 314), (604, 326), (625, 346),
           (613, 390), (599, 432), (580, 447), (435, 447), (414, 434), (405, 397)], "#66617c")
    panel([(408, 347), (430, 329), (587, 329), (612, 347), (601, 390), (582, 431),
           (440, 431), (421, 413)], "#827993")
    panel([(355, 605), (399, 581), (482, 592), (536, 592), (612, 580), (668, 608),
           (682, 755), (655, 787), (570, 800), (505, 782), (459, 799), (364, 784), (337, 758)], "#56536a")
    panel([(371, 616), (416, 600), (481, 606), (538, 606), (600, 599), (654, 616),
           (666, 748), (635, 768), (569, 778), (507, 765), (457, 778), (382, 766), (352, 747)], "#6e6884")
    return Image.alpha_composite(master, mask.resize(master.size, Image.Resampling.LANCZOS))


def mesh_texture(image, pivots, path):
    alpha = image.getchannel("A")
    x0, y0, x1, y1 = alpha.getbbox()
    left, top = (x0 - 1) // CELL * CELL, (y0 - 1) // CELL * CELL
    right = math.ceil((x1 + 1) / CELL) * CELL
    bottom = math.ceil((y1 + 1) / CELL) * CELL
    texture = image.crop((left, top, right, bottom))
    transparent = texture.getchannel("A").point(lambda value: 0 if value else 255)
    texture.paste((0, 0, 0, 0), mask=transparent)
    texture.save(path, optimize=True)
    width, height = right - left, bottom - top
    vertices, uvs, triangles, weights = [], [], [], []
    indices = {}

    def vertex(x, y):
        if (x, y) in indices:
            return indices[x, y]
        index = len(weights)
        indices[x, y] = index
        vertices.extend([x - ORIGIN[0], ORIGIN[1] - y])
        uvs.extend([round((x - left) / width, 6), round((y - top) / height, 6)])
        influences = sorted(weight_field(pivots, x, y).items(), key=lambda pair: -pair[1])[:4]
        influences = [(bone, w) for bone, w in influences if w >= .0001]
        total = sum(w for _, w in influences)
        weights.append([{"bone": bone, "weight": round(w / total, 4)} for bone, w in influences])
        return index

    for y in range(top, bottom, CELL):
        for x in range(left, right, CELL):
            if not alpha.crop((x - 1, y - 1, x + CELL + 1, y + CELL + 1)).getbbox():
                continue
            a, b, c, d = (vertex(px, py) for px, py in
                          [(x, y), (x, y + CELL), (x + CELL, y), (x + CELL, y + CELL)])
            triangles.extend([a, b, c, c, b, d])
    bounds = [left - ORIGIN[0], ORIGIN[1] - bottom, right - ORIGIN[0], ORIGIN[1] - top]
    return bounds, dict(vertices=vertices, uvs=uvs, triangles=triangles, weights=weights)


def prepare(source, output):
    layer_manifest = json.loads((source / "layer_manifest.json").read_text(encoding="utf-8"))
    artboard = layer_manifest["canvas"]
    size = artboard["width"], artboard["height"]
    if size != (1024, 1536):
        raise ValueError("The Atelier Anime 01 v0.3 drawing must use a 1024 × 1536 canvas.")
    joints, pivots = pose_setup(layer_manifest["parts"])
    parts = {p["id"]: p["file"] for p in layer_manifest["parts"]}
    garments = {g["id"]: g["file"] for g in layer_manifest["detachable_garments"]}
    master = neutral_coverage(Image.open(source / layer_manifest["master_neutral_underpaint"]).convert("RGBA"))
    (output / "layers").mkdir(parents=True, exist_ok=True)
    layers = []

    def add_layer(name, bone, order, files, kind="body", depth=None):
        if kind == "clothing":
            image = Image.open(source / files[0]).convert("RGBA")
        else:
            alpha = Image.new("L", size)
            for file in files:
                alpha = ImageChops.lighter(alpha, Image.open(source / file).getchannel("A"))
            image = master.copy()
            image.putalpha(alpha)
        path = f"layers/{name}.png"
        bounds, mesh = mesh_texture(image, pivots, output / path)
        entry = dict(id=name, kind=kind, element=name, image=path, bone=bone, bounds=bounds, order=order, mesh=mesh)
        if depth:
            entry["depthSlot"] = depth
        layers.append(entry)

    add_layer("body", "torso", 23, [parts[name] for name in ("head_base", "neck", "torso", "pelvis")])
    for side, suffix, order in [("left", "R", 0), ("right", "L", 1)]:
        add_layer(side + "-arm", side + "Arm", order,
                  [parts[f"{name}_{suffix}"] for name in ("upper_arm", "forearm", "hand")], depth=side + "-arm")
        add_layer(side + "-leg", side + "Thigh", 10 + order,
                  [parts[f"{name}_{suffix}"] for name in ("thigh", "shin", "foot")])
    add_layer("minimal-bandeau", "torso", 24, [garments["minimal_bandeau"]], kind="clothing")
    add_layer("minimal-briefs", "pelvis", 25, [garments["minimal_briefs"]], kind="clothing")
    manifest = dict(format="atelier-anime25d", version=1, name="Atelier Anime 01 – Basisfigur",
                    view="front", artboard=dict(width=size[0], height=size[1], originX=ORIGIN[0], originY=ORIGIN[1]),
                    credits=dict(author="Atelier 3D", license="Projekteigenes Ebenenpaket v0.3"),
                    joints=joints, layers=layers)
    (output / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Unpacked v0.3 layer package")
    parser.add_argument("output", type=Path, help="Atelier Anime 01 model directory")
    args = parser.parse_args()
    prepare(args.source, args.output)
