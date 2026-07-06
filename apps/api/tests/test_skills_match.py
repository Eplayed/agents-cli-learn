"""
Skill 匹配测试：验证打分匹配的正确性（词边界、中文子串、排序、限量）
"""
from app.core.skills import Skill, match_skills


def _mk(name, triggers):
    return Skill(name=name, description="", version="1.0.0", triggers=triggers, content="x")


def test_chinese_substring_match():
    skills = [_mk("weather", ["天气", "洗车"])]
    assert match_skills("上海今天天气怎么样", skills)
    assert not match_skills("今天心情不错", skills)


def test_english_word_boundary_no_false_positive():
    """英文触发词 'ai' 不应命中 'said' / 'wait'"""
    skills = [_mk("ai-helper", ["ai"])]
    assert not match_skills("he said hello and waited", skills)
    assert match_skills("what is ai", skills)


def test_english_phrase_match():
    skills = [_mk("code-review", ["code review"])]
    assert match_skills("please do a code review", skills)
    assert not match_skills("please review", skills)


def test_ranking_and_top_k():
    """命中触发词多的排前面，且最多返回 top_k 个"""
    s1 = _mk("s1", ["python"])
    s2 = _mk("s2", ["python", "编程", "代码"])
    s3 = _mk("s3", ["测试"])
    s4 = _mk("s4", ["python"])
    result = match_skills("用 python 编程写代码", [s1, s2, s3, s4], top_k=2)
    assert len(result) == 2
    assert result[0].name == "s2"  # 命中 3 个触发词，得分最高


def test_no_match_returns_empty():
    skills = [_mk("weather", ["天气"])]
    assert match_skills("hello world", skills) == []


def test_name_alone_does_not_trigger():
    """仅 Skill 名称弱匹配（0.3）不足以触发（阈值 1.0）"""
    skills = [_mk("translator", ["翻译"])]
    # 消息提到 'translator' 但没提到触发词 '翻译'
    assert match_skills("I need a translator", skills) == []
